using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// The caller's own profile. UserProvisioningMiddleware seeds it from Auth0
/// on first sign-in; after that the display name is the user's to change
/// here. Email is read-only — it comes from the identity provider.
/// </summary>
[ApiController]
[Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    // Matches the DisplayName column length on both users and contacts.
    private const int MaxDisplayNameLength = 256;

    private readonly AppDbContext _db;

    public MeController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetMe(CancellationToken ct)
    {
        var userId = User.GetUserId()!;
        var self = await _db.Contacts
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.OwnerUserId == userId && c.UserId == userId, ct);

        if (self is null) return NotFound(new { error = "User is not provisioned" });

        return Ok(MeDto.From(self));
    }

    /// <summary>
    /// Renames the caller. Writes the self-contact, which receipts display,
    /// and the users row together so the two never drift apart.
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateMeRequest request, CancellationToken ct)
    {
        var displayName = request.DisplayName.Trim();
        if (displayName.Length == 0)
            return BadRequest(new { error = "Display name is required" });
        if (displayName.Length > MaxDisplayNameLength)
            return BadRequest(new { error = $"Display name must be at most {MaxDisplayNameLength} characters" });

        var userId = User.GetUserId()!;
        var self = await _db.Contacts
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.OwnerUserId == userId && c.UserId == userId, ct);

        if (self?.User is null) return NotFound(new { error = "User is not provisioned" });

        self.DisplayName = displayName;
        self.User.DisplayName = displayName;
        await _db.SaveChangesAsync(ct);

        return Ok(MeDto.From(self));
    }
}
