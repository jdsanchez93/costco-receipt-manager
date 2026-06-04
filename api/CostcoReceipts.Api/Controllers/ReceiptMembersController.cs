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
    private readonly ILogger<ReceiptMembersController> _logger;

    public ReceiptMembersController(AppDbContext db, ILogger<ReceiptMembersController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpGet]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetMembers(string receiptId, CancellationToken ct)
    {
        var members = await _db.ReceiptMembers
            .AsNoTracking()
            .Where(m => m.ReceiptId == receiptId)
            .OrderBy(m => m.AddedAt)
            .Select(m => ReceiptMemberDto.From(m))
            .ToListAsync(ct);

        return Ok(members);
    }

    [HttpPost]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> AddMember(
        string receiptId,
        [FromBody] AddReceiptMemberRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.DisplayName))
            return BadRequest(new { error = "Display name is required" });

        if (request.UserType is not ("authenticated" or "placeholder"))
            return BadRequest(new { error = "Valid user type is required (authenticated or placeholder)" });

        var role = request.Role ?? ReceiptRoles.Editor;
        if (!ReceiptRoles.IsValid(role))
            return BadRequest(new { error = $"Invalid role. Allowed: {string.Join(", ", ReceiptRoles.All)}" });

        var addedBy = User.GetUserId()!;
        var now = DateTime.UtcNow;

        ReceiptMember member;
        if (request.UserType == "authenticated")
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest(new { error = "Email is required for authenticated users" });

            // NOTE: using email as the userId is a holdover from the old code. A
            // real-world fix would map Auth0 sub to email at sign-in time; that
            // refactor is out of scope for the migration.
            var userId = request.Email;
            var alreadyExists = await _db.ReceiptMembers
                .AnyAsync(m => m.ReceiptId == receiptId && m.UserId == userId, ct);
            if (alreadyExists) return Conflict(new { error = "User is already a member of this receipt" });

            member = new ReceiptMember
            {
                ReceiptId = receiptId,
                UserId = userId,
                UserType = "authenticated",
                Role = role,
                DisplayName = request.DisplayName,
                Email = request.Email,
                AddedBy = addedBy,
                AddedAt = now,
            };
        }
        else
        {
            var placeholderId = Guid.NewGuid().ToString();
            member = new ReceiptMember
            {
                ReceiptId = receiptId,
                UserId = placeholderId,
                PlaceholderId = placeholderId,
                UserType = "placeholder",
                Role = role,
                DisplayName = request.DisplayName,
                AddedBy = addedBy,
                AddedAt = now,
            };
        }

        _db.ReceiptMembers.Add(member);
        await _db.SaveChangesAsync(ct);

        var dto = ReceiptMemberDto.From(member);
        return CreatedAtAction(nameof(GetMembers), new { receiptId }, new
        {
            message = "Member added successfully",
            member = dto,
        });
    }

    /// <summary>
    /// A member updates their own display name + email on this receipt.
    /// Anyone in the receipt can do this for themselves.
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
            .FirstOrDefaultAsync(m => m.ReceiptId == receiptId && m.UserId == userId, ct);

        if (member is null) return NotFound(new { error = "Member record not found" });

        var displayName = string.IsNullOrWhiteSpace(request.Name)
            ? request.Email.Split('@')[0]
            : request.Name;

        member.DisplayName = displayName;
        member.Email = request.Email;
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

        // Guard: never remove the last owner.
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
