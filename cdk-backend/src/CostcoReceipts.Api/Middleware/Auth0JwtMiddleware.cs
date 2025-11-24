using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using CostcoReceipts.Api.Configuration;

namespace CostcoReceipts.Api.Middleware;

public static class Auth0JwtExtensions
{
    public static IServiceCollection AddAuth0Jwt(this IServiceCollection services)
    {
        var serviceProvider = services.BuildServiceProvider();
        var configuration = serviceProvider.GetRequiredService<IConfiguration>();
        
        var domain = configuration["AUTH0_DOMAIN"] ?? "";
        var audience = configuration["AUTH0_AUDIENCE"] ?? "";

        if (string.IsNullOrEmpty(domain) || string.IsNullOrEmpty(audience))
        {
            Console.WriteLine("Warning: Auth0 not fully configured - authentication will be skipped");
            return services;
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = $"https://{domain}/";
                options.Audience = audience;
                options.RequireHttpsMetadata = true;
                options.SaveToken = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = $"https://{domain}/",
                    ValidateAudience = true,
                    ValidAudience = audience,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(5),
                    NameClaimType = ClaimTypes.NameIdentifier,
                    RoleClaimType = ClaimTypes.Role
                };

                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        var logger = context.HttpContext.RequestServices.GetService<ILogger<Program>>();
                        logger?.LogError("Auth0 authentication failed: {Error}", context.Exception?.Message);
                        
                        if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development")
                        {
                            logger?.LogDebug("Auth0 authentication error details: {Details}", context.Exception?.ToString());
                        }
                        
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = context =>
                    {
                        var logger = context.HttpContext.RequestServices.GetService<ILogger<Program>>();
                        var userId = context.Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? 
                                   context.Principal?.FindFirst("sub")?.Value;
                        
                        logger?.LogDebug("Auth0 token validated for user: {UserId}", userId);
                        return Task.CompletedTask;
                    },
                    OnChallenge = context =>
                    {
                        var logger = context.HttpContext.RequestServices.GetService<ILogger<Program>>();
                        logger?.LogWarning("Auth0 challenge for {Path}: {Error}", 
                            context.Request.Path, context.ErrorDescription);
                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorization();

        return services;
    }
}

public class Auth0LoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<Auth0LoggingMiddleware> _logger;

    public Auth0LoggingMiddleware(RequestDelegate next, ILogger<Auth0LoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Log token details for debugging (only in development)
        if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development")
        {
            var authHeader = context.Request.Headers["Authorization"].FirstOrDefault();
            
            if (string.IsNullOrEmpty(authHeader))
            {
                _logger.LogWarning("No auth header for {Method} {Path}", 
                    context.Request.Method, context.Request.Path);
            }
            else if (authHeader.StartsWith("Bearer "))
            {
                var token = authHeader.Substring(7);
                _logger.LogDebug("Token present for {Method} {Path} (length: {Length})", 
                    context.Request.Method, context.Request.Path, token.Length);
            }
        }

        await _next(context);
    }
}