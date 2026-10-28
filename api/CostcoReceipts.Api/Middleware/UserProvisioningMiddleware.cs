using CostcoReceipts.Api.Authentication;
using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Data;
using Microsoft.AspNetCore.Authentication;
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
/// The access token carries no email or name, so those come from Auth0's
/// /userinfo (<see cref="Auth0UserInfoClient"/>), fetched only while the
/// caller's self-contact is missing, still named after their sub, or has no
/// email. The sub is the stand-in name when the fetch fails, and the upserts
/// only ever replace that stand-in or a missing email: once a real name is
/// in place the app owns it, and the user changes it through <c>/api/me</c>.
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
/// A failed /userinfo fetch is cached for only <see cref="RetryCacheTtl"/>.
/// </summary>
public class UserProvisioningMiddleware
{
    private static readonly TimeSpan ProvisionedCacheTtl = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan RetryCacheTtl = TimeSpan.FromMinutes(1);

    private readonly RequestDelegate _next;
    private readonly ILogger<UserProvisioningMiddleware> _logger;
    private readonly IMemoryCache _cache;

    public UserProvisioningMiddleware(RequestDelegate next, ILogger<UserProvisioningMiddleware> logger, IMemoryCache cache)
    {
        _next = next;
        _logger = logger;
        _cache = cache;
    }

    public async Task InvokeAsync(HttpContext context, AppDbContext db, Auth0UserInfoClient userInfo)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            await ProvisionAsync(context, db, userInfo);
        }

        await _next(context);
    }

    private async Task ProvisionAsync(HttpContext context, AppDbContext db, Auth0UserInfoClient userInfo)
    {
        var userId = context.User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return;

        var cacheKey = $"UserProvisioningMiddleware:{userId}";
        if (_cache.TryGetValue(cacheKey, out _)) return;

        var now = DateTime.UtcNow;
        var ct = context.RequestAborted;

        try
        {
            var self = await db.Contacts
                .Where(c => c.OwnerUserId == userId && c.UserId == userId)
                .Select(c => new { c.DisplayName, c.Email })
                .FirstOrDefaultAsync(ct);
            var needsProfile = self is null || self.DisplayName == userId || string.IsNullOrEmpty(self.Email);

            Auth0UserProfile? profile = null;
            if (needsProfile)
            {
                var accessToken = await context.GetTokenAsync("access_token");
                if (!string.IsNullOrEmpty(accessToken))
                {
                    profile = await userInfo.TryGetAsync(accessToken, userId, ct);
                }
            }

            var email = profile?.Email;
            var displayName = profile?.DisplayName ?? userId;

            await db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO users (UserId, Email, DisplayName, CreatedAt, LastSeenAt)
                VALUES ({userId}, {email}, {displayName}, {now}, {now})
                ON DUPLICATE KEY UPDATE
                    LastSeenAt = VALUES(LastSeenAt),
                    Email = COALESCE(NULLIF(Email, ''), VALUES(Email)),
                    DisplayName = IF(DisplayName = UserId, VALUES(DisplayName), DisplayName)
            ", ct);

            // Seed self-contact so the caller's own address book always has an
            // entry for themselves. Uniqueness on (OwnerUserId, UserId) turns
            // this into filling in a stand-in name or a missing email if it
            // already exists.
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO contacts (OwnerUserId, UserId, DisplayName, Email, CreatedAt)
                VALUES ({userId}, {userId}, {displayName}, {email}, {now})
                ON DUPLICATE KEY UPDATE
                    DisplayName = IF(DisplayName = UserId, VALUES(DisplayName), DisplayName),
                    Email = COALESCE(NULLIF(Email, ''), VALUES(Email))
            ", ct);

            var ttl = needsProfile && profile is null ? RetryCacheTtl : ProvisionedCacheTtl;
            _cache.Set(cacheKey, true, ttl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to provision user {UserId}", userId);
        }
    }
}
