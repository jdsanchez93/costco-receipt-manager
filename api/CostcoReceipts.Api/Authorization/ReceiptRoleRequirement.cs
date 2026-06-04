using Microsoft.AspNetCore.Authorization;

namespace CostcoReceipts.Api.Authorization;

/// <summary>
/// Requires the current user to be a member of the receipt identified by the
/// <c>receiptId</c> route value, and to hold one of the allowed roles.
/// </summary>
public class ReceiptRoleRequirement : IAuthorizationRequirement
{
    public IReadOnlyList<string> AllowedRoles { get; }

    public ReceiptRoleRequirement(params string[] allowedRoles)
    {
        AllowedRoles = allowedRoles;
    }
}
