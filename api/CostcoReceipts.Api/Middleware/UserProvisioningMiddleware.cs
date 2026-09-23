using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

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
///
/// A per-process in-memory cache skips the upserts for a userId that was
/// provisioned within <see cref="ProvisionedCacheTtl"/> — a single page load
/// fans out into several authenticated requests, so without this the same
/// two upserts run once per request. Staleness within the TTL window (e.g.
/// <c>LastSeenAt</c> lagging by a few minutes) is harmless, and the cache
/// resets on process restart, which just re-provisions the next request.
/// </summary>
public class UserProvisioningMiddleware
{
    private static readonly TimeSpan ProvisionedCacheTtl = TimeSpan.FromMinutes(10);

    private readonly RequestDelegate _next;
    private readonly ILogger<UserProvisioningMiddleware> _logger;
    private readonly IMemoryCache _cache;

    public UserProvisioningMiddleware(RequestDelegate next, ILogger<UserProvisioningMiddleware> logger, IMemoryCache cache)
    {
        _next = next;
        _logger = logger;
        _cache = cache;
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

        var cacheKey = $"UserProvisioningMiddleware:{userId}";
        if (_cache.TryGetValue(cacheKey, out _)) return;

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

            _cache.Set(cacheKey, true, ProvisionedCacheTtl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to provision user {UserId}", userId);
        }
    }
}
