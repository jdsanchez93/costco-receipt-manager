using System.Security.Cryptography;
using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Configuration;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Data.Entities;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// Receipt sharing: create / list / deactivate. Anonymous read access for a
/// given share token lives in <see cref="SharedController"/>.
/// </summary>
[ApiController]
[Route("api/receipts/receipt/{receiptId}")]
public class ReceiptSharesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IOptions<FrontendOptions> _frontend;

    public ReceiptSharesController(AppDbContext db, IOptions<FrontendOptions> frontend)
    {
        _db = db;
        _frontend = frontend;
    }

    [HttpPost("share")]
    [Authorize(Policy = ReceiptPolicies.Editor)]
    public async Task<IActionResult> CreateShare(
        string receiptId,
        [FromBody] CreateReceiptShareRequest? request,
        CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var expiresInDays = request?.ExpiresInDays ?? 30;
        if (expiresInDays <= 0 || expiresInDays > 365)
            return BadRequest(new { error = "expiresInDays must be between 1 and 365" });

        var now = DateTime.UtcNow;
        var share = new ReceiptShare
        {
            ReceiptId = receiptId,
            ShareToken = GenerateShareToken(),
            OwnerUserId = userId,
            CreatedAt = now,
            ExpiresAt = now.AddDays(expiresInDays),
            IsActive = true,
            CurrentUses = 0,
        };

        _db.ReceiptShares.Add(share);
        await _db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetShares), new { receiptId }, new CreateReceiptShareResponse
        {
            ShareToken = share.ShareToken,
            ShareUrl = BuildShareUrl(share.ShareToken),
            ExpiresAt = share.ExpiresAt,
        });
    }

    [HttpGet("shares")]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> GetShares(string receiptId, CancellationToken ct)
    {
        var shares = await _db.ReceiptShares
            .AsNoTracking()
            .Where(s => s.ReceiptId == receiptId && s.IsActive)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(ct);

        var dtos = shares.Select(s => new ReceiptShareDto
        {
            Id = s.Id,
            ReceiptId = s.ReceiptId,
            ShareToken = s.ShareToken,
            ShareUrl = BuildShareUrl(s.ShareToken),
            OwnerUserId = s.OwnerUserId,
            CreatedAt = s.CreatedAt,
            ExpiresAt = s.ExpiresAt,
            IsActive = s.IsActive,
            CurrentUses = s.CurrentUses,
        }).ToList();

        return Ok(dtos);
    }

    [HttpDelete("shares/{shareToken}")]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> DeactivateShare(
        string receiptId,
        string shareToken,
        CancellationToken ct)
    {
        var share = await _db.ReceiptShares
            .FirstOrDefaultAsync(s => s.ReceiptId == receiptId && s.ShareToken == shareToken, ct);

        if (share is null) return NotFound(new { error = "Share not found" });

        share.IsActive = false;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static string GenerateShareToken()
    {
        // 32 url-safe bytes ≈ 43 chars of base64url. Plenty of entropy.
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    private string BuildShareUrl(string token)
    {
        var baseUrl = string.IsNullOrEmpty(_frontend.Value.BaseUrl)
            ? "http://localhost:3000"
            : _frontend.Value.BaseUrl.TrimEnd('/');
        return $"{baseUrl}/shared-receipt/{token}";
    }
}
