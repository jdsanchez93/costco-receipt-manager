using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// Public read-only access to a receipt via a share token. No authentication
/// required, but a signed-in caller is recognized: the SPA sends its token
/// here when it has one, and JWT bearer is the default scheme, so
/// <c>User</c> is populated without an [Authorize] to demand it.
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

    /// <summary>
    /// The receipt behind a share link, or — for a caller who is already a
    /// member — a <see cref="SharedReceiptMemberResponse"/> pointing the
    /// client at the receipt itself. That holds even for an expired or
    /// deactivated link: a member's access comes from their membership, not
    /// the link, and the receipt id tells them nothing their own receipts
    /// list doesn't. <paramref name="preview"/> skips it, so a member can see
    /// what everyone else with the link sees.
    /// </summary>
    [HttpGet("shared/{shareToken}")]
    public async Task<IActionResult> GetSharedReceipt(
        string shareToken,
        [FromQuery] bool preview,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(shareToken))
        {
            return BadRequest(new { error = "Share token is required" });
        }

        var share = await _db.ReceiptShares
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.ShareToken == shareToken, ct);

        var userId = User.GetUserId();
        if (share is not null && userId is not null && !preview)
        {
            var isMember = await _db.ReceiptMembers
                .AnyAsync(m => m.ReceiptId == share.ReceiptId && m.Contact.UserId == userId, ct);
            if (isMember)
            {
                return Ok(new SharedReceiptMemberResponse { ReceiptId = share.ReceiptId });
            }
        }

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
            .Include(m => m.Contact)
            .ThenInclude(c => c.User)
            .Where(m => m.ReceiptId == receiptId)
            .OrderBy(m => m.AddedAt)
            .Select(m => SharedMemberDto.From(m))
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
            Geometry = GeometryDto.From(geometryRows, ReceiptCalculations.Sum(items)),
            ShareInfo = new ShareInfoDto
            {
                CreatedAt = share.CreatedAt,
                ExpiresAt = share.ExpiresAt,
            },
        });
    }
}
