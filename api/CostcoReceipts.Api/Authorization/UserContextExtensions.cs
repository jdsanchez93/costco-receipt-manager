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
}
