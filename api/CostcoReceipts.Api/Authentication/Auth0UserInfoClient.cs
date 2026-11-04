using System.Net.Http.Headers;

namespace CostcoReceipts.Api.Authentication;

/// <summary>
/// Reads the caller's profile from Auth0's OIDC <c>/userinfo</c> endpoint.
///
/// Access tokens for this API carry only the subject, audience and scopes —
/// no email or name. Because the SPA requests <c>openid</c> alongside the API
/// audience, Auth0 issues each access token with <c>/userinfo</c> as a second
/// audience, so the bearer token the API already holds can fetch the profile.
///
/// /userinfo is rate limited per user (roughly 5 requests a minute), so
/// callers should only ask when they actually lack the data.
/// </summary>
public class Auth0UserInfoClient
{
    private readonly HttpClient _http;
    private readonly ILogger<Auth0UserInfoClient> _logger;

    public Auth0UserInfoClient(HttpClient http, ILogger<Auth0UserInfoClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    /// <summary>
    /// Returns the profile for <paramref name="expectedSub"/>, or null on any
    /// failure (logged). A 401 means the token lacks the /userinfo audience;
    /// a 429 means the per-user rate limit was hit.
    /// </summary>
    public async Task<Auth0UserProfile?> TryGetAsync(string accessToken, string expectedSub, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        try
        {
            using var response = await _http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Auth0 /userinfo returned {StatusCode} for {UserId}", (int)response.StatusCode, expectedSub);
                return null;
            }

            var profile = await response.Content.ReadFromJsonAsync<Auth0UserProfile>(ct);
            if (profile?.Sub != expectedSub)
            {
                _logger.LogWarning("Auth0 /userinfo returned a profile for a subject other than {UserId}", expectedSub);
                return null;
            }

            return profile;
        }
        // HttpClient's own timeout surfaces as a TaskCanceledException with
        // ct not cancelled — treat that as a failure, but let a genuinely
        // aborted request propagate.
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Auth0 /userinfo request failed for {UserId}", expectedSub);
            return null;
        }
    }
}

/// <summary>The subset of the /userinfo response the API uses.</summary>
public record Auth0UserProfile(string Sub, string? Email, string? Name, string? Nickname)
{
    /// <summary>
    /// The name to show other receipt members, or null if the profile has
    /// none. Auth0 email/password sign-ups get <c>name</c> set to the email
    /// address, so <c>nickname</c> wins in that case.
    /// </summary>
    public string? DisplayName =>
        !string.IsNullOrWhiteSpace(Name) && !string.Equals(Name, Email, StringComparison.OrdinalIgnoreCase) ? Name
        : !string.IsNullOrWhiteSpace(Nickname) ? Nickname
        : !string.IsNullOrWhiteSpace(Email) ? Email.Split('@')[0]
        : null;
}
