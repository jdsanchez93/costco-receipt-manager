using Microsoft.AspNetCore.Authorization;

namespace CostcoReceipts.Api.Authorization;

public static class ReceiptAuthorizationExtensions
{
    /// <summary>
    /// Registers the receipt-role authorization handler and policies.
    /// Call after AddAuth0Jwt so the authorization services are already in place.
    /// </summary>
    public static IServiceCollection AddReceiptAuthorization(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<IAuthorizationHandler, ReceiptRoleAuthorizationHandler>();

        services.AddAuthorizationBuilder()
            .AddPolicy(ReceiptPolicies.Member, p =>
                p.Requirements.Add(new ReceiptRoleRequirement(ReceiptRoles.Owner, ReceiptRoles.Editor)))
            .AddPolicy(ReceiptPolicies.Editor, p =>
                p.Requirements.Add(new ReceiptRoleRequirement(ReceiptRoles.Owner, ReceiptRoles.Editor)))
            .AddPolicy(ReceiptPolicies.Owner, p =>
                p.Requirements.Add(new ReceiptRoleRequirement(ReceiptRoles.Owner)));

        return services;
    }
}
