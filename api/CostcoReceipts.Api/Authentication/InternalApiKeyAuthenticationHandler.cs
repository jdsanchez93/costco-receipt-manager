using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using CostcoReceipts.Api.Configuration;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace CostcoReceipts.Api.Authentication;

/// <summary>
/// Authenticates server-to-server calls (the receipt-processor Lambda) via
/// a shared secret in the X-Internal-Api-Key header, instead of an Auth0 JWT.
/// </summary>
public class InternalApiKeyAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "InternalApiKey";
    private const string HeaderName = "X-Internal-Api-Key";

    private readonly IOptions<InternalApiOptions> _internalApi;

    public InternalApiKeyAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IOptions<InternalApiOptions> internalApi)
        : base(options, logger, encoder)
    {
        _internalApi = internalApi;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HeaderName, out var provided) || string.IsNullOrEmpty(provided))
        {
            return Task.FromResult(AuthenticateResult.Fail($"Missing {HeaderName} header"));
        }

        var expected = _internalApi.Value.SharedSecret;
        if (string.IsNullOrEmpty(expected) || !FixedTimeEquals(provided.ToString(), expected))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid API key"));
        }

        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, "receipt-processor")],
            SchemeName);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
