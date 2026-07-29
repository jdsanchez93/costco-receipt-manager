using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CostcoReceipts.Migration;

public record MigratorOptions(string TableName, bool DryRun);

public class Migrator
{
    private const string EntityReceiptMember = "RECEIPT_MEMBER";
    private const string EntityReceiptItem = "RECEIPT_ITEM";
    private const string EntityReceiptGeometry = "RECEIPT_GEOMETRY";
    private const string EntityReceiptShare = "RECEIPT_SHARE";
    // PLACEHOLDER_USER is a legacy entity_type from an older schema. The current
    // API stores placeholder participants as RECEIPT_MEMBER with user_type="placeholder",
    // so PLACEHOLDER_USER rows in dev DBs represent obsolete data and are ignored.
    private const string EntityPlaceholderUserLegacy = "PLACEHOLDER_USER";

    private readonly IAmazonDynamoDB _dynamo;
    private readonly AppDbContext _db;
    private readonly ILogger<Migrator> _logger;

    public Migrator(IAmazonDynamoDB dynamo, AppDbContext db, ILogger<Migrator> logger)
    {
        _dynamo = dynamo;
        _db = db;
        _logger = logger;
    }

    public async Task<int> RunAsync(MigratorOptions options, CancellationToken ct)
    {
        _logger.LogInformation(
            "Starting migration | table={Table} | dryRun={DryRun}",
            options.TableName, options.DryRun);

        var scanned = await ScanAllAsync(options.TableName, ct);
        _logger.LogInformation("Scanned {Count} items from DynamoDB", scanned.Count);

        var groups = GroupByEntityType(scanned);

        // Group everything by receipt_id.
        var byReceipt = groups.Members
            .Concat(groups.Items)
            .Concat(groups.Geometry)
            .Concat(groups.Shares)
            .Select(GetReceiptId)
            .Where(id => !string.IsNullOrEmpty(id))
            .Distinct()
            .ToHashSet();

        _logger.LogInformation("Discovered {Count} distinct receipt_id values", byReceipt.Count);

        // Idempotency: skip receipts already present in MySQL.
        var existingIds = await _db.Receipts
            .AsNoTracking()
            .Where(r => byReceipt.Contains(r.ReceiptId))
            .Select(r => r.ReceiptId)
            .ToHashSetAsync(ct);

        var toMigrate = byReceipt.Except(existingIds).ToList();
        _logger.LogInformation(
            "{Existing} receipts already in MySQL, {ToMigrate} to migrate",
            existingIds.Count, toMigrate.Count);

        if (toMigrate.Count == 0)
        {
            _logger.LogInformation("Nothing to do.");
            return 0;
        }

        var migrated = 0;
        foreach (var receiptId in toMigrate)
        {
            try
            {
                if (await MigrateReceiptAsync(receiptId, groups, options.DryRun, ct))
                {
                    migrated++;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to migrate receipt {ReceiptId}", receiptId);
            }
        }

        _logger.LogInformation(
            "Migration complete | migrated={Migrated} | skipped={Skipped}",
            migrated, toMigrate.Count - migrated);

        return migrated;
    }

    // ============================================================
    // Per-receipt migration
    // ============================================================

    private async Task<bool> MigrateReceiptAsync(
        string receiptId,
        ScanGroups groups,
        bool dryRun,
        CancellationToken ct)
    {
        // Clear anything left tracked from a previous receipt — especially
        // important after a SaveChangesAsync failure, where entities remain
        // in the Added state even though the SQL transaction rolled back.
        _db.ChangeTracker.Clear();

        var rawMembers = groups.Members
            .Where(m => GetReceiptId(m) == receiptId)
            .Select(DynamoMappers.ToReceiptMember)
            .ToList();

        // Drop members that still have no identifier after the mapper's
        // placeholder_id fallback — these are irrecoverably bad rows.
        var identifiedMembers = rawMembers.Where(m => !string.IsNullOrEmpty(m.UserId)).ToList();
        var droppedNoId = rawMembers.Count - identifiedMembers.Count;

        // Dedupe by (ReceiptId, UserId) — matches the MySQL unique index. Keep
        // the earliest AddedAt so the "owner" designation lands on the original
        // member rather than a later duplicate row.
        var members = identifiedMembers
            .GroupBy(m => m.UserId)
            .Select(g => g.OrderBy(m => m.AddedAt).First())
            .OrderBy(m => m.AddedAt)
            .ToList();
        var droppedDupes = identifiedMembers.Count - members.Count;

        if (droppedNoId > 0 || droppedDupes > 0)
        {
            _logger.LogWarning(
                "Receipt {ReceiptId}: dropped {NoId} member(s) with no identifier, {Dupes} duplicate(s)",
                receiptId, droppedNoId, droppedDupes);
        }

        if (members.Count == 0)
        {
            _logger.LogWarning(
                "Skipping receipt {ReceiptId}: no usable RECEIPT_MEMBER rows",
                receiptId);
            return false;
        }

        // Backfill roles: earliest AddedAt wins owner, rest editor.
        for (var i = 0; i < members.Count; i++)
        {
            members[i].Role = i == 0 ? "owner" : "editor";
        }

        var owner = members[0];

        // Synthesize the parent Receipt row from the owner's metadata.
        var receipt = new Receipt
        {
            ReceiptId = receiptId,
            OwnerUserId = owner.UserId,
            CreatedAt = owner.AddedAt,
        };

        // Items + their assignments
        var items = groups.Items
            .Where(i => GetReceiptId(i) == receiptId)
            .Select(DynamoMappers.ToReceiptItem)
            .ToList();

        var geometry = groups.Geometry
            .Where(g => GetReceiptId(g) == receiptId)
            .Select(DynamoMappers.ToReceiptGeometry)
            .ToList();

        var shares = groups.Shares
            .Where(s => GetReceiptId(s) == receiptId)
            .Select(DynamoMappers.ToReceiptShare)
            .ToList();

        _logger.LogInformation(
            "Receipt {ReceiptId}: owner={Owner} members={M} items={I} geometry={G} shares={S}",
            receiptId, owner.UserId, members.Count, items.Count, geometry.Count, shares.Count);

        if (dryRun) return true;

        // EF Core: use a transaction so a partial receipt doesn't survive a failure.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        _db.Receipts.Add(receipt);
        _db.ReceiptMembers.AddRange(members);
        _db.ReceiptGeometries.AddRange(geometry);
        _db.ReceiptShares.AddRange(shares);

        // Items need their generated Id before we can attach assignments.
        // Save items first, then wire up assignments.
        var itemEntities = new List<(ReceiptItem Entity, IReadOnlyList<string> AssignedUsers)>();
        foreach (var (entity, assigned) in items)
        {
            _db.ReceiptItems.Add(entity);
            itemEntities.Add((entity, assigned));
        }

        await _db.SaveChangesAsync(ct);

        foreach (var (entity, assigned) in itemEntities)
        {
            foreach (var userId in assigned.Distinct())
            {
                _db.ReceiptItemAssignments.Add(new ReceiptItemAssignment
                {
                    ReceiptItemId = entity.Id,
                    UserId = userId,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return true;
    }

    // ============================================================
    // DynamoDB scan (paginated)
    // ============================================================

    private async Task<List<Dictionary<string, AttributeValue>>> ScanAllAsync(
        string tableName, CancellationToken ct)
    {
        var all = new List<Dictionary<string, AttributeValue>>();
        Dictionary<string, AttributeValue>? startKey = null;

        do
        {
            var request = new ScanRequest
            {
                TableName = tableName,
                ExclusiveStartKey = startKey,
            };
            var response = await _dynamo.ScanAsync(request, ct);
            all.AddRange(response.Items);
            startKey = response.LastEvaluatedKey is { Count: > 0 } ? response.LastEvaluatedKey : null;

            _logger.LogDebug("Scanned page: {Total} items so far", all.Count);
        }
        while (startKey is not null);

        return all;
    }

    // ============================================================
    // Grouping helpers
    // ============================================================

    private record ScanGroups(
        List<Dictionary<string, AttributeValue>> Members,
        List<Dictionary<string, AttributeValue>> Items,
        List<Dictionary<string, AttributeValue>> Geometry,
        List<Dictionary<string, AttributeValue>> Shares);

    private ScanGroups GroupByEntityType(List<Dictionary<string, AttributeValue>> items)
    {
        var groups = new ScanGroups([], [], [], []);
        var countsByType = new Dictionary<string, int>();

        foreach (var item in items)
        {
            var entityType = item.TryGetValue("entity_type", out var v) && v.S is not null
                ? v.S
                : "(missing)";
            countsByType[entityType] = countsByType.GetValueOrDefault(entityType) + 1;

            switch (entityType)
            {
                case EntityReceiptMember: groups.Members.Add(item); break;
                case EntityReceiptItem: groups.Items.Add(item); break;
                case EntityReceiptGeometry: groups.Geometry.Add(item); break;
                case EntityReceiptShare: groups.Shares.Add(item); break;
                case EntityPlaceholderUserLegacy: break; // legacy, intentionally ignored
                default: break;                          // unknown, reported below
            }
        }

        // Log every entity_type we saw and how the migrator treated it. This
        // makes bad or stale data immediately visible instead of vanishing
        // silently into a "skipped N unknown" count.
        foreach (var (type, count) in countsByType.OrderByDescending(kv => kv.Value))
        {
            var disposition = type switch
            {
                EntityReceiptMember or EntityReceiptItem or
                    EntityReceiptGeometry or EntityReceiptShare => "migrated",
                EntityPlaceholderUserLegacy => "ignored (legacy)",
                _ => "SKIPPED (unrecognized entity_type)",
            };
            _logger.LogInformation(
                "entity_type={Type,-24} count={Count,-6} {Disposition}",
                type, count, disposition);
        }

        return groups;
    }

    private static string GetReceiptId(Dictionary<string, AttributeValue> item) =>
        item.TryGetValue("receipt_id", out var v) && v.S is not null ? v.S : string.Empty;
}
