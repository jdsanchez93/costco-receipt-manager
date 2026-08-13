using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Middleware;

/// <summary>
/// On every authenticated request, upsert a <c>users</c> row for the caller
/// (identified by the JWT "sub" claim) and ensure their self-contact exists.
/// Both operations use raw <c>INSERT ... ON DUPLICATE KEY UPDATE</c> so they
/// are race-safe under concurrent first-time-login requests. Errors are
/// swallowed — a users-table hiccup should not fail the underlying request.
///
/// Runs after <c>UseAuthentication</c> and before <c>UseAuthorization</c>
/// so the auth handler can rely on the user + self-contact existing.
/// </summary>
public class UserProvisioningMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<UserProvisioningMiddleware> _logger;

    public UserProvisioningMiddleware(RequestDelegate next, ILogger<UserProvisioningMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            await ProvisionAsync(context, db);
        }

        await _next(context);
    }

    private async Task ProvisionAsync(HttpContext context, AppDbContext db)
    {
        var userId = context.User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return;

        var email = context.User.FindFirst("email")?.Value ?? string.Empty;
        var displayName = context.User.FindFirst("name")?.Value
                       ?? context.User.FindFirst("nickname")?.Value
                       ?? (string.IsNullOrEmpty(email) ? userId : email.Split('@')[0]);
        var now = DateTime.UtcNow;
        var ct = context.RequestAborted;

        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO users (UserId, Email, DisplayName, CreatedAt, LastSeenAt)
                VALUES ({userId}, {email}, {displayName}, {now}, {now})
                ON DUPLICATE KEY UPDATE
                    LastSeenAt = VALUES(LastSeenAt),
                    Email = COALESCE(NULLIF(VALUES(Email), ''), Email),
                    DisplayName = COALESCE(NULLIF(VALUES(DisplayName), ''), DisplayName)
            ", ct);

            // Seed self-contact so the caller's own address book always has an
            // entry for themselves. Uniqueness on (OwnerUserId, UserId) makes
            // this a no-op if it already exists.
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT IGNORE INTO contacts (OwnerUserId, UserId, DisplayName, Email, CreatedAt)
                VALUES ({userId}, {userId}, {displayName}, {email}, {now})
            ", ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to provision user {UserId}", userId);
        }
    }
}
