using CostcoReceipts.Api.Configuration;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;

namespace CostcoReceipts.Api.Authentication;

public static class Auth0JwtExtensions
{
    public static IServiceCollection AddAuth0Jwt(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<Auth0Options>(configuration.GetSection(Auth0Options.SectionName));

        var auth0 = configuration.GetSection(Auth0Options.SectionName).Get<Auth0Options>() ?? new Auth0Options();

        if (string.IsNullOrEmpty(auth0.Domain) || string.IsNullOrEmpty(auth0.Audience))
        {
            throw new InvalidOperationException(
                "Auth0:Domain and Auth0:Audience must be configured. " +
                "Set them in appsettings.json, user secrets, or environment variables.");
        }

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = $"https://{auth0.Domain}/";
                options.Audience = auth0.Audience;
                options.RequireHttpsMetadata = true;
                options.SaveToken = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = $"https://{auth0.Domain}/",
                    ValidateAudience = true,
                    ValidAudience = auth0.Audience,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(5),
                    NameClaimType = ClaimTypes.NameIdentifier,
                    RoleClaimType = ClaimTypes.Role,
                };
            });

        services.AddAuthorization();

        return services;
    }
}
