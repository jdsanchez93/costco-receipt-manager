using CostcoReceipts.Api.Authentication;
using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Data.Entities;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// Server-to-server endpoints for the receipt-processor Lambda, authenticated
/// by a shared secret (see InternalApiKeyAuthenticationHandler) instead of an
/// Auth0 JWT. Not reachable by end users.
/// </summary>
[ApiController]
[Route("api/internal/receipts")]
[Authorize(AuthenticationSchemes = InternalApiKeyAuthenticationHandler.SchemeName)]
public class InternalController : ControllerBase
{
    private static readonly JsonSerializerOptions PolygonJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly AppDbContext _db;
    private readonly ILogger<InternalController> _logger;

    public InternalController(AppDbContext db, ILogger<InternalController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpPost("{receiptId}/ocr-results")]
    public async Task<IActionResult> PostOcrResults(
        string receiptId,
        [FromBody] OcrResultsRequest request,
        CancellationToken ct)
    {
        var receipt = await _db.Receipts.FindAsync([receiptId], ct);
        if (receipt is null) return NotFound(new { error = "Receipt not found" });

        var ownerMember = await _db.ReceiptMembers
            .FirstOrDefaultAsync(m => m.ReceiptId == receiptId && m.Role == ReceiptRoles.Owner, ct);
        if (ownerMember is null)
        {
            _logger.LogError("Receipt {ReceiptId} has no owner member", receiptId);
            return Problem("Receipt has no owner member", statusCode: StatusCodes.Status500InternalServerError);
        }

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        // Idempotent replace: a re-POST for the same receipt (retry, or
        // future re-processing) just overwrites its OCR results.
        var existingItems = await _db.ReceiptItems.Where(i => i.ReceiptId == receiptId).ToListAsync(ct);
        _db.ReceiptItems.RemoveRange(existingItems);
        var existingGeometry = await _db.ReceiptGeometries.Where(g => g.ReceiptId == receiptId).ToListAsync(ct);
        _db.ReceiptGeometries.RemoveRange(existingGeometry);
        await _db.SaveChangesAsync(ct);

        var now = DateTime.UtcNow;
        var itemEntities = new List<ReceiptItem>();
        for (var i = 0; i < request.Items.Count; i++)
        {
            var dto = request.Items[i];
            var entity = new ReceiptItem
            {
                ReceiptId = receiptId,
                ItemIndex = i,
                ItemNumber = dto.ItemNumber,
                ItemName = dto.ItemName,
                Price = dto.Price,
                Discount = dto.Discount,
                TaxCode = dto.TaxCode,
                CreatedAt = now,
            };
            _db.ReceiptItems.Add(entity);
            itemEntities.Add(entity);
        }

        foreach (var g in request.Geometry)
        {
            _db.ReceiptGeometries.Add(new ReceiptGeometry
            {
                ReceiptId = receiptId,
                FieldName = g.FieldName,
                FieldType = g.FieldType,
                Text = g.Text,
                Confidence = g.Confidence,
                BoundingBoxWidth = g.BoundingBox.Width,
                BoundingBoxHeight = g.BoundingBox.Height,
                BoundingBoxLeft = g.BoundingBox.Left,
                BoundingBoxTop = g.BoundingBox.Top,
                PolygonJson = JsonSerializer.Serialize(g.Polygon, PolygonJsonOptions),
                CreatedAt = now,
            });
        }

        await _db.SaveChangesAsync(ct); // items get their Ids here

        // Auto-assign every item to the receipt's owner, matching the
        // Lambda's previous DynamoDB behavior (assigned_users=[owner]).
        foreach (var item in itemEntities)
        {
            _db.ReceiptItemAssignments.Add(new ReceiptItemAssignment
            {
                ReceiptItemId = item.Id,
                ReceiptMemberId = ownerMember.Id,
            });
        }

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return NoContent();
    }
}
