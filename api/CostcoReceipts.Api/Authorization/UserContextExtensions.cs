using System.Security.Claims;

namespace CostcoReceipts.Api.Authorization;

public static class UserContextExtensions
{
    /// <summary>
    /// Returns the Auth0 user identifier (the JWT "sub" claim) for the current principal.
    /// </summary>
    public static string? GetUserId(this ClaimsPrincipal user) =>
        user.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? user.FindFirst("sub")?.Value;

    /// <summary>
    /// Extracts the bearer token from the Authorization header, for forwarding
    /// to upstream APIs (S3 presigned-URL gateway, etc.).
    /// </summary>
    public static string? GetBearerToken(this HttpRequest request)
    {
        var header = request.Headers.Authorization.FirstOrDefault();
        const string prefix = "Bearer ";
        if (header is not null && header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return header[prefix.Length..].Trim();
        }
        return null;
    }
}
