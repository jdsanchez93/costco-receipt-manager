using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Data.Entities;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Controllers;

[ApiController]
[Route("api/receipts/receipt/{receiptId}/items")]
public class ReceiptItemsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ReceiptItemsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetItems(string receiptId, CancellationToken ct)
    {
        var items = await _db.ReceiptItems
            .AsNoTracking()
            .Include(i => i.Assignments)
            .Where(i => i.ReceiptId == receiptId)
            .OrderBy(i => i.ItemIndex)
            .Select(i => ReceiptItemDto.From(i))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPut("{itemId:long}/assignment")]
    [Authorize(Policy = ReceiptPolicies.Editor)]
    public async Task<IActionResult> UpdateAssignment(
        string receiptId,
        long itemId,
        [FromBody] UpdateItemAssignmentRequest request,
        CancellationToken ct)
    {
        var item = await _db.ReceiptItems
            .Include(i => i.Assignments)
            .FirstOrDefaultAsync(i => i.Id == itemId && i.ReceiptId == receiptId, ct);

        if (item is null) return NotFound(new { error = "Item not found on this receipt" });

        var validMemberIds = await ValidMemberIdsAsync(receiptId, request.AssignedMemberIds, ct);
        if (validMemberIds is null)
            return BadRequest(new { error = "One or more assignee ids are not members of this receipt" });

        ReplaceAssignments(item, validMemberIds);
        item.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "Item assignment updated successfully",
            receiptId,
            itemId,
            assignedMemberIds = validMemberIds,
        });
    }

    [HttpPut("assignments/bulk")]
    [Authorize(Policy = ReceiptPolicies.Editor)]
    public async Task<IActionResult> BulkUpdateAssignments(
        string receiptId,
        [FromBody] BulkUpdateItemAssignmentsRequest request,
        CancellationToken ct)
    {
        // Validate all assignee ids against this receipt's membership up front.
        var allAssignees = request.Updates.SelectMany(u => u.AssignedMemberIds).ToList();
        var validated = await ValidMemberIdsAsync(receiptId, allAssignees, ct);
        if (validated is null)
            return BadRequest(new { error = "One or more assignee ids are not members of this receipt" });

        var itemIds = request.Updates.Select(u => u.ItemId).ToList();
        var items = await _db.ReceiptItems
            .Include(i => i.Assignments)
            .Where(i => i.ReceiptId == receiptId && itemIds.Contains(i.Id))
            .ToListAsync(ct);

        var itemsById = items.ToDictionary(i => i.Id);
        var now = DateTime.UtcNow;
        var applied = 0;

        foreach (var update in request.Updates)
        {
            if (!itemsById.TryGetValue(update.ItemId, out var item)) continue;
            ReplaceAssignments(item, update.AssignedMemberIds);
            item.UpdatedAt = now;
            applied++;
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "Bulk assignment update completed",
            receiptId,
            requestedCount = request.Updates.Count,
            appliedCount = applied,
        });
    }

    [HttpDelete("assignments/all")]
    [Authorize(Policy = ReceiptPolicies.Editor)]
    public async Task<IActionResult> ClearAllAssignments(string receiptId, CancellationToken ct)
    {
        var items = await _db.ReceiptItems
            .Include(i => i.Assignments)
            .Where(i => i.ReceiptId == receiptId)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        var touched = 0;
        foreach (var item in items)
        {
            if (item.Assignments.Count == 0) continue;
            item.Assignments.Clear();
            item.UpdatedAt = now;
            touched++;
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "All assignments cleared successfully",
            receiptId,
            itemsTouched = touched,
        });
    }

    private static void ReplaceAssignments(ReceiptItem item, IEnumerable<long> memberIds)
    {
        item.Assignments.Clear();
        foreach (var memberId in memberIds.Distinct())
        {
            item.Assignments.Add(new ReceiptItemAssignment
            {
                ReceiptItemId = item.Id,
                ReceiptMemberId = memberId,
            });
        }
    }

    /// <summary>
    /// Returns the distinct requested ids if all belong to the receipt, or null
    /// if any id is not a member of this receipt.
    /// </summary>
    private async Task<List<long>?> ValidMemberIdsAsync(
        string receiptId, IEnumerable<long> requested, CancellationToken ct)
    {
        var distinct = requested.Distinct().ToList();
        if (distinct.Count == 0) return distinct;

        var validCount = await _db.ReceiptMembers
            .Where(m => m.ReceiptId == receiptId && distinct.Contains(m.Id))
            .CountAsync(ct);

        return validCount == distinct.Count ? distinct : null;
    }
}
