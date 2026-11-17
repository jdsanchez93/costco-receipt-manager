using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// The caller's address book: the people they have put on receipts they
/// uploaded. Only ever the caller's own book — a contact id from someone
/// else's is never readable here.
/// </summary>
[ApiController]
[Route("api/contacts")]
[Authorize]
public class ContactsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ContactsController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// The caller's contacts, most recently used first, without their
    /// self-contact. <paramref name="q"/> keeps the names containing it and
    /// puts exact matches on top. <paramref name="forReceipt"/> marks the
    /// contacts on the receipt the caller uploaded just before that one, for
    /// "Same people as last receipt".
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetContacts(
        [FromQuery] string? q,
        [FromQuery] string? forReceipt,
        CancellationToken ct)
    {
        var userId = User.GetUserId()!;

        // A book is one person's contacts, so it is small enough to rank in
        // memory — which the shown name needs anyway (MemberNames).
        var rows = await _db.Contacts
            .AsNoTracking()
            .Where(c => c.OwnerUserId == userId && c.UserId != userId)
            .Select(c => new
            {
                Contact = c,
                c.User,
                ReceiptCount = c.Memberships.Count(),
                LastUsedAt = c.Memberships.Max(m => (DateTime?)m.AddedAt),
            })
            .ToListAsync(ct);

        var onPrevious = await ContactsOnPreviousReceiptAsync(userId, forReceipt, ct);

        var query = q?.Trim() ?? string.Empty;
        var contacts = rows
            .Select(r =>
            {
                r.Contact.User = r.User;
                return new ContactDto
                {
                    ContactId = r.Contact.ContactId,
                    DisplayName = MemberNames.Of(r.Contact),
                    HasAccount = r.Contact.UserId is not null,
                    ReceiptCount = r.ReceiptCount,
                    LastUsedAt = r.LastUsedAt,
                    OnPreviousReceipt = onPrevious.Contains(r.Contact.ContactId),
                };
            })
            .Where(c => query.Length == 0 || c.DisplayName.Contains(query, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(c => query.Length > 0 && string.Equals(c.DisplayName, query, StringComparison.OrdinalIgnoreCase))
            .ThenByDescending(c => c.LastUsedAt)
            .ThenByDescending(c => c.ReceiptCount)
            .ThenBy(c => c.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(contacts);
    }

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
