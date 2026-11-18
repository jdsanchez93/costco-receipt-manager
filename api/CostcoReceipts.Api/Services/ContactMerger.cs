using CostcoReceipts.Api.Data;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;

namespace CostcoReceipts.Api.Services;

public enum ContactMergeOutcome
{
    Merged,
    /// <summary>Either contact isn't in the owner's book, or the target is the owner's own.</summary>
    NotFound,
    SameContact,
    /// <summary>Only a placeholder can be merged away: two accounts never merge.</summary>
    SourceHasAccount,
    /// <summary>
    /// Both are on at least one receipt, where they would collapse into one
    /// membership. Two people on one receipt are two people.
    /// </summary>
    SharedReceipt,
    /// <summary>
    /// A membership changed underneath the merge — someone was added to a
    /// receipt mid-way — and it was rolled back. Retrying re-checks.
    /// </summary>
    Conflict,
}

public sealed record ContactMergeResult(
    ContactMergeOutcome Outcome,
    int MembershipsMoved = 0,
    int SharedReceipts = 0);

/// <summary>
/// Folds one contact into another in the same owner's book: every membership
/// of the source moves to the target, keeping its role and its items (which
/// hang off the membership, not the contact), and the source is deleted.
///
/// Shared by the contacts page, the claim prompt and the maintenance CLI.
/// The rules here are the ones every caller needs: same owner, a placeholder
/// source, never two contacts on one receipt. A caller that merges without
/// asking anyone, like the CLI's by-name pass, adds its own on top.
/// </summary>
public class ContactMerger
{
    private readonly AppDbContext _db;

    public ContactMerger(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// What makes placeholders likely duplicates: the same name, ignoring
    /// case and surrounding space, in the same book.
    /// </summary>
    public static string NameKey(string displayName) => displayName.Trim().ToLowerInvariant();

    /// <summary>
    /// Runs in its own transaction, or in the caller's when one is open, so a
    /// caller merging several contacts can make them all-or-nothing. A caller
    /// with its own transaction must roll it back on
    /// <see cref="ContactMergeOutcome.Conflict"/>: the move may be half-done
    /// inside it.
    /// </summary>
    public async Task<ContactMergeResult> MergeAsync(
        string ownerUserId, long sourceId, long targetId, CancellationToken ct)
    {
        if (sourceId == targetId) return new(ContactMergeOutcome.SameContact);

        var contacts = await _db.Contacts
            .AsNoTracking()
            .Where(c => c.OwnerUserId == ownerUserId && (c.ContactId == sourceId || c.ContactId == targetId))
            .Select(c => new { c.ContactId, c.UserId })
            .ToListAsync(ct);
        var source = contacts.FirstOrDefault(c => c.ContactId == sourceId);
        var target = contacts.FirstOrDefault(c => c.ContactId == targetId);
        if (source is null || target is null || target.UserId == ownerUserId)
            return new(ContactMergeOutcome.NotFound);
        if (source.UserId is not null) return new(ContactMergeOutcome.SourceHasAccount);

        var shared = await _db.ReceiptMembers.CountAsync(m =>
            m.ContactId == sourceId
            && _db.ReceiptMembers.Any(o => o.ReceiptId == m.ReceiptId && o.ContactId == targetId), ct);
        if (shared > 0) return new(ContactMergeOutcome.SharedReceipt, SharedReceipts: shared);

        // The check above can go stale: someone may add the target to one of
        // the source's receipts, or the source to a new one, before this
        // commits. The unique (ReceiptId, ContactId) index and the
        // memberships' Restrict FK catch both, and the rollback undoes the
        // half-done move.
        await using var ownTransaction = _db.Database.CurrentTransaction is null
            ? await _db.Database.BeginTransactionAsync(ct)
            : null;
        try
        {
            var moved = await _db.ReceiptMembers
                .Where(m => m.ContactId == sourceId)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.ContactId, targetId), ct);
            await _db.Contacts
                .Where(c => c.ContactId == sourceId)
                .ExecuteDeleteAsync(ct);
            if (ownTransaction is not null) await ownTransaction.CommitAsync(ct);
            return new(ContactMergeOutcome.Merged, MembershipsMoved: moved);
        }
        catch (MySqlException ex) when (ex.ErrorCode is MySqlErrorCode.DuplicateKeyEntry
                                            or MySqlErrorCode.RowIsReferenced2)
        {
            return new(ContactMergeOutcome.Conflict);
        }
    }
}
