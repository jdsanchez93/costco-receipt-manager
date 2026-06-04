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

        ReplaceAssignments(item, request.AssignedUsers);
        item.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "Item assignment updated successfully",
            receiptId,
            itemId,
            assignedUsers = request.AssignedUsers,
        });
    }

    [HttpPut("assignments/bulk")]
    [Authorize(Policy = ReceiptPolicies.Editor)]
    public async Task<IActionResult> BulkUpdateAssignments(
        string receiptId,
        [FromBody] BulkUpdateItemAssignmentsRequest request,
        CancellationToken ct)
    {
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
            ReplaceAssignments(item, update.AssignedUsers);
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
        foreach (var item in items)
        {
            if (item.Assignments.Count == 0) continue;
            item.Assignments.Clear();
            item.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "All assignments cleared successfully",
            receiptId,
            itemsTouched = items.Count(i => i.UpdatedAt == now),
        });
    }

    private static void ReplaceAssignments(ReceiptItem item, List<string> userIds)
    {
        item.Assignments.Clear();
        foreach (var userId in userIds.Distinct())
        {
            item.Assignments.Add(new ReceiptItemAssignment
            {
                ReceiptItemId = item.Id,
                UserId = userId,
            });
        }
    }
}
