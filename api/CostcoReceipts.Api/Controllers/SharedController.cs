using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// Public read-only access to a receipt via a share token. No authentication required.
/// </summary>
[ApiController]
[Route("api/receipts")]
public class SharedController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<SharedController> _logger;

    public SharedController(AppDbContext db, ILogger<SharedController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpGet("shared/{shareToken}")]
    public async Task<IActionResult> GetSharedReceipt(string shareToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(shareToken))
        {
            return BadRequest(new { error = "Share token is required" });
        }

        var share = await _db.ReceiptShares
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.ShareToken == shareToken, ct);

        if (share is null || !share.IsActive || share.ExpiresAt < DateTime.UtcNow)
        {
            _logger.LogInformation(
                "Share lookup miss for token {ShareToken} (found={Found}, active={Active}, expired={Expired})",
                shareToken,
                share is not null,
                share?.IsActive,
                share is not null && share.ExpiresAt < DateTime.UtcNow);

            return NotFound(new { error = "Invalid or expired share link" });
        }

        var receiptId = share.ReceiptId;

        // Three parallel queries against the same DbContext are not safe — EF Core
        // forbids concurrent operations on one context. Run them sequentially; each
        // is a single round-trip to MySQL on localhost so total latency is fine.
        var items = await _db.ReceiptItems
            .AsNoTracking()
            .Include(i => i.Assignments)
            .Where(i => i.ReceiptId == receiptId)
            .OrderBy(i => i.ItemIndex)
            .Select(i => ReceiptItemDto.From(i))
            .ToListAsync(ct);

        var members = await _db.ReceiptMembers
            .AsNoTracking()
            .Where(m => m.ReceiptId == receiptId)
            .OrderBy(m => m.AddedAt)
            .Select(m => ReceiptMemberDto.From(m))
            .ToListAsync(ct);

        var geometryRows = await _db.ReceiptGeometries
            .AsNoTracking()
            .Where(g => g.ReceiptId == receiptId)
            .ToListAsync(ct);

        return Ok(new SharedReceiptResponse
        {
            ReceiptId = receiptId,
            Items = items,
            Members = members,
            Geometry = GeometryDto.From(geometryRows),
            ShareInfo = new ShareInfoDto
            {
                CreatedAt = share.CreatedAt,
                ExpiresAt = share.ExpiresAt,
            },
        });
    }
}
