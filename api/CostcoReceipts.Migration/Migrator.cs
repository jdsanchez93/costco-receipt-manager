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
    private const string EntityPlaceholderUser = "PLACEHOLDER_USER";

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
        LogScanBreakdown(groups);

        // Group everything by receipt_id.
        var byReceipt = groups.Members
            .Concat(groups.Items)
            .Concat(groups.Geometry)
            .Concat(groups.Shares)
            .Concat(groups.Placeholders)
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
        var members = groups.Members
            .Where(m => GetReceiptId(m) == receiptId)
            .Select(DynamoMappers.ToReceiptMember)
            .OrderBy(m => m.AddedAt)
            .ToList();

        if (members.Count == 0)
        {
            _logger.LogWarning(
                "Skipping receipt {ReceiptId}: no RECEIPT_MEMBER rows found (orphaned data)",
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

        var placeholders = groups.Placeholders
            .Where(p => GetReceiptId(p) == receiptId)
            .Select(DynamoMappers.ToPlaceholderUser)
            .ToList();

        _logger.LogInformation(
            "Receipt {ReceiptId}: owner={Owner} members={M} items={I} geometry={G} shares={S} placeholders={P}",
            receiptId, owner.UserId, members.Count, items.Count, geometry.Count, shares.Count, placeholders.Count);

        if (dryRun) return true;

        // EF Core: use a transaction so a partial receipt doesn't survive a failure.
        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        _db.Receipts.Add(receipt);
        _db.ReceiptMembers.AddRange(members);
        _db.ReceiptGeometries.AddRange(geometry);
        _db.ReceiptShares.AddRange(shares);
        _db.PlaceholderUsers.AddRange(placeholders);

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
        List<Dictionary<string, AttributeValue>> Shares,
        List<Dictionary<string, AttributeValue>> Placeholders);

    private ScanGroups GroupByEntityType(List<Dictionary<string, AttributeValue>> items)
    {
        var groups = new ScanGroups([], [], [], [], []);
        var unknown = 0;

        foreach (var item in items)
        {
            var entityType = item.TryGetValue("entity_type", out var v) ? v.S : null;
            switch (entityType)
            {
                case EntityReceiptMember: groups.Members.Add(item); break;
                case EntityReceiptItem: groups.Items.Add(item); break;
                case EntityReceiptGeometry: groups.Geometry.Add(item); break;
                case EntityReceiptShare: groups.Shares.Add(item); break;
                case EntityPlaceholderUser: groups.Placeholders.Add(item); break;
                default: unknown++; break;
            }
        }

        if (unknown > 0)
        {
            _logger.LogWarning("Skipped {Count} items with unknown or missing entity_type", unknown);
        }

        return groups;
    }

    private void LogScanBreakdown(ScanGroups g) => _logger.LogInformation(
        "Breakdown: members={M} items={I} geometry={G} shares={S} placeholders={P}",
        g.Members.Count, g.Items.Count, g.Geometry.Count, g.Shares.Count, g.Placeholders.Count);

    private static string GetReceiptId(Dictionary<string, AttributeValue> item) =>
        item.TryGetValue("receipt_id", out var v) && v.S is not null ? v.S : string.Empty;
}
