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
            .Where(m => m.ReceiptId == receiptId)
            .OrderBy(m => m.AddedAt)
            .Select(m => ReceiptMemberDto.From(m))
            .ToListAsync(ct);

        return Ok(members);
    }

    /// <summary>
    /// Adds a placeholder participant to a receipt. Always creates a fresh
    /// Contact in the receipt owner's address book (no dedup by display name —
    /// two "John"s are two Johns). Adding an authenticated user by picking
    /// from the owner's existing contacts will be its own future endpoint.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> AddMember(
        string receiptId,
        [FromBody] AddReceiptMemberRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.DisplayName))
            return BadRequest(new { error = "Display name is required" });

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

        // New placeholder contact in the receipt owner's address book.
        var contact = new Contact
        {
            OwnerUserId = receiptOwnerUserId,
            UserId = null,
            DisplayName = request.DisplayName,
            Email = request.Email,
            CreatedAt = now,
        };
        _db.Contacts.Add(contact);
        await _db.SaveChangesAsync(ct);

        var member = new ReceiptMember
        {
            ReceiptId = receiptId,
            ContactId = contact.ContactId,
            Role = role,
            AddedByMemberId = callerMemberId,
            AddedAt = now,
        };
        _db.ReceiptMembers.Add(member);
        await _db.SaveChangesAsync(ct);

        member.Contact = contact;
        return CreatedAtAction(nameof(GetMembers), new { receiptId }, new
        {
            message = "Member added successfully",
            member = ReceiptMemberDto.From(member),
        });
    }

    /// <summary>
    /// A member updates the display name / email on THEIR own Contact for this
    /// receipt. Anyone in the receipt can edit their own row. Only touches the
    /// contact, not the receipt_members metadata.
    /// </summary>
    [HttpPut("update-details")]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> UpdateOwnDetails(
        string receiptId,
        [FromBody] UpdateMemberDetailsRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { error = "Email is required" });

        var userId = User.GetUserId()!;
        var member = await _db.ReceiptMembers
            .Include(m => m.Contact)
            .FirstOrDefaultAsync(m => m.ReceiptId == receiptId && m.Contact.UserId == userId, ct);

        if (member is null) return NotFound(new { error = "Member record not found" });

        var displayName = string.IsNullOrWhiteSpace(request.Name)
            ? request.Email.Split('@')[0]
            : request.Name;

        member.Contact.DisplayName = displayName;
        member.Contact.Email = request.Email;
        member.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "Member details updated successfully",
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
