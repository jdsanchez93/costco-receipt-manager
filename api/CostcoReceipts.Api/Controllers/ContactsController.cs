using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Models;
using CostcoReceipts.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// The caller's address book: the people they have put on receipts they
/// uploaded. Only ever the caller's own book — a contact id from someone
/// else's is never readable or writable here, and reads as not found. The
/// caller's self-contact is hidden throughout.
/// </summary>
[ApiController]
[Route("api/contacts")]
[Authorize]
public class ContactsController : ControllerBase
{
    private const int MaxNameLength = 256;

    private readonly AppDbContext _db;
    private readonly ContactMerger _merger;

    public ContactsController(AppDbContext db, ContactMerger merger)
    {
        _db = db;
        _merger = merger;
    }

    /// <summary>
    /// The caller's contacts, most recently used first. <paramref name="q"/>
    /// keeps the names containing it and puts exact matches on top.
    /// <paramref name="forReceipt"/> marks the contacts on the receipt the
    /// caller uploaded just before that one, for "Same people as last
    /// receipt".
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetContacts(
        [FromQuery] string? q,
        [FromQuery] string? forReceipt,
        CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var book = await LoadBookAsync(userId, ct);

        var onPrevious = await ContactsOnPreviousReceiptAsync(userId, forReceipt, ct);
        foreach (var c in book) c.OnPreviousReceipt = onPrevious.Contains(c.ContactId);

        var query = q?.Trim() ?? string.Empty;
        var contacts = book
            .Where(c => query.Length == 0 || c.DisplayName.Contains(query, StringComparison.OrdinalIgnoreCase))
            // Stable, so the book's recency order holds within each half.
            .OrderByDescending(c => query.Length > 0 && string.Equals(c.DisplayName, query, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return Ok(contacts);
    }

    /// <summary>
    /// What the contacts page asks the caller to look at: placeholders that
    /// share a name. Its length is the side nav's badge.
    /// </summary>
    [HttpGet("review")]
    public async Task<IActionResult> GetReview(CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var book = await LoadBookAsync(userId, ct);

        var groups = book
            .Where(c => !c.HasAccount)
            .GroupBy(c => ContactMerger.NameKey(c.DisplayName))
            .Where(g => g.Count() > 1)
            .Select(g => g.ToList())
            .ToList();
        if (groups.Count == 0) return Ok(new ContactReviewDto());

        var ids = groups.SelectMany(g => g).Select(c => c.ContactId).ToList();
        var receiptsOf = (await _db.ReceiptMembers
                .AsNoTracking()
                .Where(m => ids.Contains(m.ContactId))
                .Select(m => new { m.ContactId, m.ReceiptId })
                .ToListAsync(ct))
            .ToLookup(m => m.ContactId, m => m.ReceiptId);

        // The book is in recency order, and grouping keeps it, so each
        // group's first contact is its most recently used.
        var review = new ContactReviewDto
        {
            Duplicates = groups
                .Select(g => new DuplicateContactsDto
                {
                    DisplayName = g[0].DisplayName.Trim(),
                    Contacts = g,
                    // A contact is on a receipt at most once (unique index),
                    // so a receipt id that repeats has two of them on it.
                    CanMergeAll = g
                        .SelectMany(c => receiptsOf[c.ContactId])
                        .GroupBy(r => r)
                        .All(r => r.Count() == 1),
                })
                .ToList(),
        };
        return Ok(review);
    }

    /// <summary>A contact's page: the receipts they're on, and who they could be merged into.</summary>
    [HttpGet("{contactId:long}")]
    public async Task<IActionResult> GetContact(long contactId, CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var book = await LoadBookAsync(userId, ct);
        var contact = book.FirstOrDefault(c => c.ContactId == contactId);
        if (contact is null) return NotFound(new { error = "Contact not found" });

        var receipts = await _db.ReceiptMembers
            .AsNoTracking()
            .Where(m => m.ContactId == contactId)
            .OrderByDescending(m => m.Receipt.CreatedAt)
            .Select(m => new ContactReceiptDto
            {
                ReceiptId = m.ReceiptId,
                CreatedAt = m.Receipt.CreatedAt,
                ItemCount = m.Receipt.Items.Count(),
                MemberCount = m.Receipt.Members.Count(),
            })
            .ToListAsync(ct);

        var detail = new ContactDetailDto { Contact = contact, Receipts = receipts };
        if (!contact.HasAccount)
        {
            var receiptIds = receipts.Select(r => r.ReceiptId).ToList();
            var onTheirReceipts = (await _db.ReceiptMembers
                    .AsNoTracking()
                    .Where(m => receiptIds.Contains(m.ReceiptId))
                    .Select(m => m.ContactId)
                    .Distinct()
                    .ToListAsync(ct))
                .ToHashSet();

            var key = ContactMerger.NameKey(contact.DisplayName);
            detail.MergeTargets = book
                .Where(c => c.ContactId != contactId && !onTheirReceipts.Contains(c.ContactId))
                .OrderByDescending(c => ContactMerger.NameKey(c.DisplayName) == key)
                .ToList();
        }

        return Ok(detail);
    }

    /// <summary>Rename a placeholder. An account's name belongs to its user (<c>/api/me</c>).</summary>
    [HttpPatch("{contactId:long}")]
    public async Task<IActionResult> UpdateContact(
        long contactId, [FromBody] UpdateContactRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var name = request.DisplayName?.Trim();
        if (string.IsNullOrEmpty(name)) return BadRequest(new { error = "A name is required" });
        if (name.Length > MaxNameLength)
            return BadRequest(new { error = $"A name can be at most {MaxNameLength} characters" });

        var contact = await _db.Contacts
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.ContactId == contactId && c.OwnerUserId == userId && c.UserId != userId, ct);
        if (contact is null) return NotFound(new { error = "Contact not found" });
        if (contact.UserId is not null)
            return Conflict(new { error = $"Only {MemberNames.Of(contact)} can change their name." });

        contact.DisplayName = name;
        await _db.SaveChangesAsync(ct);

        var book = await LoadBookAsync(userId, ct);
        return Ok(book.First(c => c.ContactId == contactId));
    }

    /// <summary>
    /// Remove a placeholder that is on no receipts. One that is on some is
    /// merged instead, which keeps its items; the memberships' Restrict FK
    /// would refuse the delete anyway. Accounts stay: there is no way to add
    /// one back but another claim.
    /// </summary>
    [HttpDelete("{contactId:long}")]
    public async Task<IActionResult> DeleteContact(long contactId, CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var contact = await _db.Contacts
            .AsNoTracking()
            .Include(c => c.User)
            .Where(c => c.ContactId == contactId && c.OwnerUserId == userId && c.UserId != userId)
            .Select(c => new { Contact = c, Receipts = c.Memberships.Count() })
            .FirstOrDefaultAsync(ct);
        if (contact is null) return NotFound(new { error = "Contact not found" });

        var name = MemberNames.Of(contact.Contact);
        if (contact.Contact.UserId is not null)
            return Conflict(new { error = $"{name} has an account, so they stay in your contacts." });
        if (contact.Receipts > 0)
            return Conflict(new { error = $"{name} is on {ReceiptCount(contact.Receipts)}. Merge them into someone instead." });

        try
        {
            await _db.Contacts.Where(c => c.ContactId == contactId).ExecuteDeleteAsync(ct);
        }
        catch (MySqlException ex) when (ex.ErrorCode is MySqlErrorCode.RowIsReferenced2)
        {
            return Conflict(new { error = $"{name} was just added to a receipt. Merge them into someone instead." });
        }

        return NoContent();
    }

    /// <summary>
    /// Fold this placeholder into <see cref="MergeContactRequest.IntoContactId"/>,
    /// which takes over its receipts, roles and items. See <see cref="ContactMerger"/>.
    /// Returns the contact merged into.
    /// </summary>
    [HttpPost("{contactId:long}/merge")]
    public async Task<IActionResult> MergeContact(
        long contactId, [FromBody] MergeContactRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var result = await _merger.MergeAsync(userId, contactId, request.IntoContactId, ct);

        switch (result.Outcome)
        {
            case ContactMergeOutcome.Merged:
                var book = await LoadBookAsync(userId, ct);
                return Ok(book.First(c => c.ContactId == request.IntoContactId));
            case ContactMergeOutcome.SameContact:
                return BadRequest(new { error = "A contact can't be merged into itself." });
            case ContactMergeOutcome.SourceHasAccount:
                return Conflict(new { error = "Only someone without an account can be merged into another contact." });
            case ContactMergeOutcome.SharedReceipt:
                return Conflict(new { error = $"They're both on {ReceiptCount(result.SharedReceipts)}, so they're different people." });
            case ContactMergeOutcome.Conflict:
                return Conflict(new { error = "Their receipts changed while merging. Try again." });
            default:
                return NotFound(new { error = "Contact not found" });
        }
    }

    /// <summary>
    /// The caller's whole book bar their self-contact, most recently used
    /// first. A book is one person's contacts, so it is small enough to rank
    /// and filter in memory — which the shown name needs anyway (MemberNames).
    /// </summary>
    private async Task<List<ContactDto>> LoadBookAsync(string userId, CancellationToken ct)
    {
        var rows = await _db.Contacts
            .AsNoTracking()
            .Include(c => c.User)
            .Where(c => c.OwnerUserId == userId && c.UserId != userId)
            .Select(c => new
            {
                Contact = c,
                ReceiptCount = c.Memberships.Count(),
                LastUsedAt = c.Memberships.Max(m => (DateTime?)m.AddedAt),
            })
            .ToListAsync(ct);

        return rows
            .Select(r => new ContactDto
            {
                ContactId = r.Contact.ContactId,
                DisplayName = MemberNames.Of(r.Contact),
                HasAccount = r.Contact.UserId is not null,
                ReceiptCount = r.ReceiptCount,
                LastUsedAt = r.LastUsedAt,
            })
            .OrderByDescending(c => c.LastUsedAt)
            .ThenByDescending(c => c.ReceiptCount)
            .ThenBy(c => c.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string ReceiptCount(int n) => n == 1 ? "1 receipt" : $"{n} receipts";

    /// <summary>
    /// Ids of the contacts on the receipt the caller uploaded most recently
    /// before <paramref name="receiptId"/>, skipping receipts nobody else
    /// was added to — an abandoned upload in between shouldn't empty the
    /// suggestion. Empty unless the caller uploaded <paramref name="receiptId"/>
    /// too: memberships only reference the uploader's book.
    /// </summary>
    private async Task<HashSet<long>> ContactsOnPreviousReceiptAsync(
        string userId, string? receiptId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(receiptId)) return [];

        var createdAt = await _db.Receipts
            .Where(r => r.ReceiptId == receiptId && r.OwnerUserId == userId)
            .Select(r => (DateTime?)r.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (createdAt is null) return [];

        var previousId = await _db.Receipts
            .Where(r => r.OwnerUserId == userId && r.ReceiptId != receiptId && r.CreatedAt <= createdAt
                && r.Members.Any(m => m.Contact.UserId != userId))
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => r.ReceiptId)
            .FirstOrDefaultAsync(ct);
        if (previousId is null) return [];

        var ids = await _db.ReceiptMembers
            .Where(m => m.ReceiptId == previousId)
            .Select(m => m.ContactId)
            .ToListAsync(ct);
        return ids.ToHashSet();
    }
}
