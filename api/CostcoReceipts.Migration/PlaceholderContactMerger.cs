using CostcoReceipts.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CostcoReceipts.Migration;

public record MergeStats(
    int GroupsEvaluated,
    int GroupsMerged,
    int GroupsSkippedEmailConflict,
    int GroupsSkippedSameReceipt,
    int ContactsRemoved,
    int MembershipsReassigned);

/// <summary>
/// Post-migration cleanup: collapses placeholder Contacts that share a
/// (OwnerUserId, normalized DisplayName) into one canonical Contact so an
/// owner who added the same "John" to five receipts ends up with a single
/// "John" in their address book. Auth-user contacts (UserId is not null)
/// are left alone — they're already deduped by the unique index.
///
/// Safety rules — a merge group is only collapsed when all hold:
///   1. Every contact in the group is a placeholder (UserId is null)
///   2. Emails do not contradict (at most one distinct non-empty email)
///   3. No single receipt has receipt_members pointing at more than one
///      contact in the group (otherwise merging would violate the
///      (ReceiptId, ContactId) unique index and silently drop a membership)
/// </summary>
public class PlaceholderContactMerger
{
    private readonly AppDbContext _db;
    private readonly ILogger<PlaceholderContactMerger> _logger;

    public PlaceholderContactMerger(AppDbContext db, ILogger<PlaceholderContactMerger> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<MergeStats> RunAsync(bool dryRun, CancellationToken ct)
    {
        _logger.LogInformation(
            "Starting placeholder-contact merge | dryRun={DryRun}", dryRun);

        var placeholders = await _db.Contacts
            .AsNoTracking()
            .Where(c => c.UserId == null)
            .Select(c => new PlaceholderRow(c.ContactId, c.OwnerUserId, c.DisplayName, c.Email))
            .ToListAsync(ct);

        _logger.LogInformation("Loaded {Count} placeholder contacts", placeholders.Count);

        // Group by (OwnerUserId, normalized DisplayName), keep only groups with dupes.
        var groups = placeholders
            .GroupBy(c => new GroupKey(c.OwnerUserId, Normalize(c.DisplayName)))
            .Where(g => g.Count() > 1)
            .OrderBy(g => g.Key.OwnerUserId)
            .ThenBy(g => g.Key.NormalizedName)
            .ToList();

        _logger.LogInformation("Found {Count} candidate merge group(s)", groups.Count);

        var stats = new Accumulator();

        foreach (var group in groups)
        {
            stats.GroupsEvaluated++;
            await EvaluateGroupAsync(group.Key, group.ToList(), dryRun, stats, ct);
        }

        var final = stats.Snapshot();
        _logger.LogInformation(
            "Merge complete | evaluated={E} merged={M} skipped-email={SE} skipped-same-receipt={SR} " +
            "contacts-removed={CR} memberships-reassigned={MR}",
            final.GroupsEvaluated, final.GroupsMerged,
            final.GroupsSkippedEmailConflict, final.GroupsSkippedSameReceipt,
            final.ContactsRemoved, final.MembershipsReassigned);

        return final;
    }

    private async Task EvaluateGroupAsync(
        GroupKey key,
        List<PlaceholderRow> members,
        bool dryRun,
        Accumulator stats,
        CancellationToken ct)
    {
        var distinctEmails = members
            .Where(m => !string.IsNullOrEmpty(m.Email))
            .Select(m => m.Email!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (distinctEmails.Count > 1)
        {
            _logger.LogInformation(
                "SKIP  owner={Owner} name={Name} count={Count} reason=email-conflict [{Emails}]",
                key.OwnerUserId, key.NormalizedName, members.Count, string.Join(", ", distinctEmails));
            stats.GroupsSkippedEmailConflict++;
            return;
        }

        var contactIds = members.Select(m => m.ContactId).ToList();

        // Any receipt where memberships reference more than one contact in the group?
        var collidingReceipts = await _db.ReceiptMembers
            .AsNoTracking()
            .Where(m => contactIds.Contains(m.ContactId))
            .GroupBy(m => m.ReceiptId)
            .Select(g => new
            {
                ReceiptId = g.Key,
                DistinctContacts = g.Select(m => m.ContactId).Distinct().Count(),
            })
            .Where(x => x.DistinctContacts > 1)
            .Select(x => x.ReceiptId)
            .ToListAsync(ct);

        if (collidingReceipts.Count > 0)
        {
            _logger.LogInformation(
                "SKIP  owner={Owner} name={Name} count={Count} reason=multiple-on-same-receipt [{Receipts}]",
                key.OwnerUserId, key.NormalizedName, members.Count,
                string.Join(", ", collidingReceipts));
            stats.GroupsSkippedSameReceipt++;
            return;
        }

        var canonical = members.OrderBy(m => m.ContactId).First();
        var redundantIds = members.Where(m => m.ContactId != canonical.ContactId)
            .Select(m => m.ContactId)
            .ToList();

        var membershipCount = await _db.ReceiptMembers
            .CountAsync(m => redundantIds.Contains(m.ContactId), ct);

        _logger.LogInformation(
            "{Verb} owner={Owner} name={Name} count={Count}→{Kept} canonical={Canonical} memberships-reassigned={MC}",
            dryRun ? "PLAN " : "MERGE",
            key.OwnerUserId, key.NormalizedName, members.Count, 1, canonical.ContactId, membershipCount);

        if (!dryRun)
        {
            await using var tx = await _db.Database.BeginTransactionAsync(ct);

            await _db.ReceiptMembers
                .Where(m => redundantIds.Contains(m.ContactId))
                .ExecuteUpdateAsync(
                    s => s.SetProperty(m => m.ContactId, canonical.ContactId),
                    ct);

            await _db.Contacts
                .Where(c => redundantIds.Contains(c.ContactId))
                .ExecuteDeleteAsync(ct);

            await tx.CommitAsync(ct);
        }

        stats.GroupsMerged++;
        stats.ContactsRemoved += redundantIds.Count;
        stats.MembershipsReassigned += membershipCount;
    }

    private static string Normalize(string s) => s.Trim().ToLowerInvariant();

    private record PlaceholderRow(long ContactId, string OwnerUserId, string DisplayName, string? Email);
    private record GroupKey(string OwnerUserId, string NormalizedName);

    private sealed class Accumulator
    {
        public int GroupsEvaluated;
        public int GroupsMerged;
        public int GroupsSkippedEmailConflict;
        public int GroupsSkippedSameReceipt;
        public int ContactsRemoved;
        public int MembershipsReassigned;

        public MergeStats Snapshot() => new(
            GroupsEvaluated, GroupsMerged,
            GroupsSkippedEmailConflict, GroupsSkippedSameReceipt,
            ContactsRemoved, MembershipsReassigned);
    }
}
