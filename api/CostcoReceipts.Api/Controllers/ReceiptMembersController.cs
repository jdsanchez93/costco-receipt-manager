using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Data.Entities;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Controllers;

[ApiController]
[Route("api/receipts/receipt/{receiptId}/members")]
public class ReceiptMembersController : ControllerBase
{
    // Matches the DisplayName column length on contacts.
    private const int MaxDisplayNameLength = 256;

    private readonly AppDbContext _db;

    public ReceiptMembersController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetMembers(string receiptId, CancellationToken ct)
    {
        var members = await _db.ReceiptMembers
            .AsNoTracking()
            .Include(m => m.Contact)
            .ThenInclude(c => c.User)
            .Where(m => m.ReceiptId == receiptId)
            .OrderBy(m => m.AddedAt)
            .Select(m => ReceiptMemberDto.From(m))
            .ToListAsync(ct);

        return Ok(members);
    }

    /// <summary>
    /// Adds someone to a receipt, as an existing contact or as a new person.
    ///
    /// A new person always gets a fresh placeholder Contact in the receipt
    /// owner's address book (no dedup by display name — two "John"s are two
    /// Johns).
    ///
    /// An existing contact must be in the book of the receipt's uploader, and
    /// only the uploader may pick from it. Contact ids are sequential, so
    /// without the first check any owner could attach a stranger's account to
    /// their receipt; without the second a promoted co-owner could do the
    /// same with the uploader's contacts, none of whom they were ever
    /// introduced to. Both failures read as the contact not existing.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> AddMember(
        string receiptId,
        [FromBody] AddReceiptMemberRequest request,
        CancellationToken ct)
    {
        var displayName = request.DisplayName?.Trim() ?? string.Empty;
        if (request.ContactId is null && displayName.Length == 0)
            return BadRequest(new { error = "Either a contact or a display name is required" });
        if (request.ContactId is not null && displayName.Length > 0)
            return BadRequest(new { error = "Send either a contact or a display name, not both" });
        if (displayName.Length > MaxDisplayNameLength)
            return BadRequest(new { error = $"Display name must be at most {MaxDisplayNameLength} characters" });

        var role = request.Role ?? ReceiptRoles.Editor;
        if (!ReceiptRoles.IsValid(role))
            return BadRequest(new { error = $"Invalid role. Allowed: {string.Join(", ", ReceiptRoles.All)}" });

        var callerUserId = User.GetUserId()!;
        var receiptOwnerUserId = await _db.Receipts
            .Where(r => r.ReceiptId == receiptId)
            .Select(r => r.OwnerUserId)
            .FirstOrDefaultAsync(ct);
        if (receiptOwnerUserId is null) return NotFound(new { error = "Receipt not found" });

        // Locate the caller's member row on this receipt so we can record AddedByMemberId.
        var callerMemberId = await _db.ReceiptMembers
            .Where(m => m.ReceiptId == receiptId && m.Contact.UserId == callerUserId)
            .Select(m => (long?)m.Id)
            .FirstOrDefaultAsync(ct);

        var now = DateTime.UtcNow;

        Contact? contact;
        if (request.ContactId is { } contactId)
        {
            contact = callerUserId == receiptOwnerUserId
                ? await _db.Contacts
                    .Include(c => c.User)
                    .FirstOrDefaultAsync(c => c.ContactId == contactId && c.OwnerUserId == receiptOwnerUserId, ct)
                : null;
            if (contact is null) return NotFound(new { error = "Contact not found" });

            if (await _db.ReceiptMembers.AnyAsync(m => m.ReceiptId == receiptId && m.ContactId == contactId, ct))
                return Conflict(new { error = $"{MemberNames.Of(contact)} is already on this receipt" });
        }
        else
        {
            // New placeholder contact in the receipt owner's address book.
            contact = new Contact
            {
                OwnerUserId = receiptOwnerUserId,
                UserId = null,
                DisplayName = displayName,
                CreatedAt = now,
            };
        }

        // One save: EF inserts a new contact ahead of the membership that
        // references it, in the same transaction.
        var member = new ReceiptMember
        {
            ReceiptId = receiptId,
            Contact = contact,
            Role = role,
            AddedByMemberId = callerMemberId,
            AddedAt = now,
        };
        _db.ReceiptMembers.Add(member);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) when (request.ContactId is not null)
        {
            // Lost a race with another add of the same contact: the unique
            // index on (ReceiptId, ContactId) refused the second.
            return Conflict(new { error = $"{MemberNames.Of(contact)} is already on this receipt" });
        }

        return CreatedAtAction(nameof(GetMembers), new { receiptId }, new
        {
            message = "Member added successfully",
            member = ReceiptMemberDto.From(member),
        });
    }

    [HttpPut("{memberId:long}/role")]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> UpdateRole(
        string receiptId,
        long memberId,
        [FromBody] UpdateMemberRoleRequest request,
        CancellationToken ct)
    {
        if (!ReceiptRoles.IsValid(request.Role))
            return BadRequest(new { error = $"Invalid role. Allowed: {string.Join(", ", ReceiptRoles.All)}" });

        var member = await _db.ReceiptMembers
            .Include(m => m.Contact)
            .ThenInclude(c => c.User)
            .FirstOrDefaultAsync(m => m.Id == memberId && m.ReceiptId == receiptId, ct);

        if (member is null) return NotFound(new { error = "Member not found on this receipt" });

        // Guard: never strip the last owner.
        if (member.Role == ReceiptRoles.Owner && request.Role != ReceiptRoles.Owner)
        {
            var otherOwners = await _db.ReceiptMembers
                .CountAsync(m => m.ReceiptId == receiptId && m.Role == ReceiptRoles.Owner && m.Id != memberId, ct);
            if (otherOwners == 0)
                return Conflict(new { error = "Cannot demote the last owner" });
        }

        member.Role = request.Role;
        member.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "Member role updated successfully",
            member = ReceiptMemberDto.From(member),
        });
    }

    [HttpDelete("{memberId:long}")]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> RemoveMember(string receiptId, long memberId, CancellationToken ct)
    {
        var member = await _db.ReceiptMembers
            .FirstOrDefaultAsync(m => m.Id == memberId && m.ReceiptId == receiptId, ct);

        if (member is null) return NotFound(new { error = "Member not found on this receipt" });

        if (member.Role == ReceiptRoles.Owner)
        {
            var otherOwners = await _db.ReceiptMembers
                .CountAsync(m => m.ReceiptId == receiptId && m.Role == ReceiptRoles.Owner && m.Id != memberId, ct);
            if (otherOwners == 0)
                return Conflict(new { error = "Cannot remove the last owner" });
        }

        _db.ReceiptMembers.Remove(member);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }
}
