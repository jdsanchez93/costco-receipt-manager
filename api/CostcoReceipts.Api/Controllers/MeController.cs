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
        var user = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.UserId == userId, ct);

        if (user is null) return NotFound(new { error = "User is not provisioned" });

        return Ok(MeDto.From(user));
    }

    /// <summary>
    /// Renames the caller. The users row holds the name — the one this
    /// profile and every receipt they're on show. The self-contact's copy
    /// is written alongside it only so an older image, which still reads
    /// that copy, shows the same name after a rollback.
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

        self.User.DisplayName = displayName;
        self.DisplayName = displayName;
        await _db.SaveChangesAsync(ct);

        return Ok(MeDto.From(self.User));
    }
}
