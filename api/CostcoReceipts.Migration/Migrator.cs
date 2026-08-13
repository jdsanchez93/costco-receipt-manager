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

    /// <summary>
    /// Cache of contacts by (OwnerUserId, UserId). Populated at start-of-run from
    /// existing rows; extended when new auth contacts are created during migration.
    /// Placeholder contacts (UserId=null) are NOT cached — each placeholder
    /// membership creates a fresh Contact.
    /// </summary>
    private readonly Dictionary<(string Owner, string UserId), long> _authContactCache = new();

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

        // Materialize all members up front — we need them for user backfill and
        // per-receipt processing, and the mapping already runs the self-heal.
        var allMembers = groups.Members
            .Select(DynamoMappers.ToScannedMember)
            .Where(m => !string.IsNullOrEmpty(m.OldUserId))
            .ToList();

        var membersByReceipt = allMembers.GroupBy(m => m.ReceiptId).ToDictionary(g => g.Key, g => g.ToList());

        // Step 1: users. Insert one per distinct authenticated OldUserId, seeded
        // from whatever member row has the most useful email/display name. We
        // also seed a self-contact per user so the auth handler can find their
        // membership on any receipt they own.
        if (!options.DryRun)
        {
            await BackfillUsersAsync(allMembers, ct);
            await PrimeAuthContactCacheAsync(ct);
        }

        // Step 2: work out which receipts to process. Idempotency: skip any
        // ReceiptId already present in the Receipts table.
        var candidateReceiptIds = allMembers.Select(m => m.ReceiptId).Distinct().ToHashSet();
        var existingReceiptIds = await _db.Receipts
            .AsNoTracking()
            .Where(r => candidateReceiptIds.Contains(r.ReceiptId))
            .Select(r => r.ReceiptId)
            .ToHashSetAsync(ct);

        var toMigrate = candidateReceiptIds.Except(existingReceiptIds).ToList();
        _logger.LogInformation(
            "{Existing} receipts already in MySQL, {ToMigrate} to migrate",
            existingReceiptIds.Count, toMigrate.Count);

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
                if (!membersByReceipt.TryGetValue(receiptId, out var members))
                {
                    _logger.LogWarning(
                        "Skipping receipt {ReceiptId}: no usable RECEIPT_MEMBER rows",
                        receiptId);
                    continue;
                }

                if (await MigrateReceiptAsync(receiptId, members, groups, options.DryRun, ct))
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
    // Users backfill
    // ============================================================

    private async Task BackfillUsersAsync(List<DynamoMappers.ScannedMember> allMembers, CancellationToken ct)
    {
        // Group all authenticated memberships by user_id and derive user rows.
        var authGroups = allMembers
            .Where(m => m.IsAuthenticated)
            .GroupBy(m => m.OldUserId)
            .ToList();

        var existingUserIds = await _db.Users
            .AsNoTracking()
            .Select(u => u.UserId)
            .ToHashSetAsync(ct);

        var now = DateTime.UtcNow;
        var inserted = 0;

        foreach (var group in authGroups)
        {
            var userId = group.Key;
            if (existingUserIds.Contains(userId)) continue;

            var email = group.Select(m => m.Email).FirstOrDefault(e => !string.IsNullOrEmpty(e));
            var displayName = group.Select(m => m.DisplayName).FirstOrDefault(n => !string.IsNullOrEmpty(n))
                ?? (email is not null ? email.Split('@')[0] : userId);
            var earliest = group.Min(m => m.AddedAt);
            var latest = group.Max(m => m.AddedAt);

            _db.Users.Add(new User
            {
                UserId = userId,
                Email = email,
                DisplayName = displayName,
                CreatedAt = earliest,
                LastSeenAt = latest,
            });

            // Self-contact: this user's entry in their OWN address book, matching
            // what UserProvisioningMiddleware seeds at login. Ensures owners have
            // a Contact for themselves to attach their own ReceiptMember to.
            _db.Contacts.Add(new Contact
            {
                OwnerUserId = userId,
                UserId = userId,
                DisplayName = displayName,
                Email = email,
                CreatedAt = earliest,
            });

            inserted++;
        }

        if (inserted > 0)
        {
            await _db.SaveChangesAsync(ct);
        }

        _logger.LogInformation("Users backfill: {New} new, {Existing} already present",
            inserted, existingUserIds.Count);
    }

    /// <summary>
    /// Load every existing (OwnerUserId, UserId) contact pair into the in-memory
    /// cache. Includes the self-contacts we just inserted plus anything from
    /// prior runs. Called once, after user backfill.
    /// </summary>
    private async Task PrimeAuthContactCacheAsync(CancellationToken ct)
    {
        var rows = await _db.Contacts
            .AsNoTracking()
            .Where(c => c.UserId != null)
            .Select(c => new { c.OwnerUserId, c.UserId, c.ContactId })
            .ToListAsync(ct);

        foreach (var r in rows)
        {
            _authContactCache[(r.OwnerUserId, r.UserId!)] = r.ContactId;
        }

        _logger.LogInformation("Primed auth contact cache with {Count} entries", rows.Count);
    }

    // ============================================================
    // Per-receipt migration
    // ============================================================

    private async Task<bool> MigrateReceiptAsync(
        string receiptId,
        List<DynamoMappers.ScannedMember> scannedMembers,
        ScanGroups groups,
        bool dryRun,
        CancellationToken ct)
    {
        _db.ChangeTracker.Clear();

        // Dedupe by OldUserId within this receipt, keeping earliest AddedAt so
        // the "earliest becomes owner" rule survives the dedupe.
        var deduped = scannedMembers
            .GroupBy(m => m.OldUserId)
            .Select(g => g.OrderBy(m => m.AddedAt).First())
            .OrderBy(m => m.AddedAt)
            .ToList();

        var droppedDupes = scannedMembers.Count - deduped.Count;
        if (droppedDupes > 0)
        {
            _logger.LogWarning(
                "Receipt {ReceiptId}: dropped {Dupes} duplicate member row(s)",
                receiptId, droppedDupes);
        }

        // Owner is the earliest-added AUTHENTICATED member (owner must be a real
        // user because receipts.OwnerUserId FKs to users.UserId).
        var owner = deduped.FirstOrDefault(m => m.IsAuthenticated);
        if (owner is null)
        {
            _logger.LogWarning(
                "Skipping receipt {ReceiptId}: no authenticated members to assign as owner",
                receiptId);
            return false;
        }

        // Assign roles: owner + everyone else "editor".
        var roles = deduped.ToDictionary(m => m.OldUserId, m => m == owner ? "owner" : "editor");

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
            receiptId, owner.OldUserId, deduped.Count, items.Count, geometry.Count, shares.Count);

        if (dryRun) return true;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        // Receipt row (FK to users.UserId is now enforced, so owner must exist —
        // which it does because BackfillUsersAsync ran first).
        var receipt = new Receipt
        {
            ReceiptId = receiptId,
            OwnerUserId = owner.OldUserId,
            CreatedAt = owner.AddedAt,
        };
        _db.Receipts.Add(receipt);

        // Members: create/reuse Contact per member, then create ReceiptMember.
        // Track (oldUserId → new ReceiptMember) so we can translate assignments.
        var memberIdMap = new Dictionary<string, ReceiptMember>();
        foreach (var m in deduped)
        {
            var contactId = await GetOrCreateContactAsync(owner.OldUserId, m, ct);
            var rm = new ReceiptMember
            {
                ReceiptId = receiptId,
                ContactId = contactId,
                Role = roles[m.OldUserId],
                AddedByMemberId = null, // legacy data doesn't preserve the graph
                AddedAt = m.AddedAt,
                UpdatedAt = m.UpdatedAt,
                ValidationStatus = m.ValidationStatus,
                ValidatedAt = m.ValidatedAt,
                Comments = m.Comments,
            };
            _db.ReceiptMembers.Add(rm);
            memberIdMap[m.OldUserId] = rm;
        }

        _db.ReceiptGeometries.AddRange(geometry);
        _db.ReceiptShares.AddRange(shares);

        // Items in one save so we get their Ids for assignment inserts.
        var itemEntities = new List<(ReceiptItem Entity, IReadOnlyList<string> AssignedUsers)>();
        foreach (var (entity, assigned) in items)
        {
            _db.ReceiptItems.Add(entity);
            itemEntities.Add((entity, assigned));
        }

        await _db.SaveChangesAsync(ct);

        // Assignments: translate old user_id strings to new ReceiptMember.Id
        // using memberIdMap. Silently drop assignments to non-members (was
        // possible in the old schema; not permitted by the new FK).
        var droppedAssignments = 0;
        foreach (var (entity, assigned) in itemEntities)
        {
            foreach (var oldUserId in assigned.Distinct())
            {
                if (!memberIdMap.TryGetValue(oldUserId, out var member))
                {
                    droppedAssignments++;
                    continue;
                }
                _db.ReceiptItemAssignments.Add(new ReceiptItemAssignment
                {
                    ReceiptItemId = entity.Id,
                    ReceiptMemberId = member.Id,
                });
            }
        }

        if (droppedAssignments > 0)
        {
            _logger.LogWarning(
                "Receipt {ReceiptId}: dropped {Count} assignment(s) pointing to non-members",
                receiptId, droppedAssignments);
        }

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return true;
    }

    /// <summary>
    /// Returns the ContactId for the given scanned member, creating a Contact
    /// row if none exists. Auth members are deduped by (owner, user_id) via
    /// the cache; placeholders always create a fresh Contact.
    /// </summary>
    private async Task<long> GetOrCreateContactAsync(
        string receiptOwnerUserId,
        DynamoMappers.ScannedMember m,
        CancellationToken ct)
    {
        if (m.IsAuthenticated)
        {
            if (_authContactCache.TryGetValue((receiptOwnerUserId, m.OldUserId), out var cached))
            {
                return cached;
            }

            var contact = new Contact
            {
                OwnerUserId = receiptOwnerUserId,
                UserId = m.OldUserId,
                DisplayName = m.DisplayName,
                Email = m.Email,
                CreatedAt = m.AddedAt,
            };
            _db.Contacts.Add(contact);
            await _db.SaveChangesAsync(ct);
            _authContactCache[(receiptOwnerUserId, m.OldUserId)] = contact.ContactId;
            return contact.ContactId;
        }
        else
        {
            var contact = new Contact
            {
                OwnerUserId = receiptOwnerUserId,
                UserId = null,
                DisplayName = m.DisplayName,
                Email = m.Email,
                CreatedAt = m.AddedAt,
            };
            _db.Contacts.Add(contact);
            await _db.SaveChangesAsync(ct);
            return contact.ContactId;
        }
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
    // Grouping
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
