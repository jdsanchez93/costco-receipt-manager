using System.Security.Claims;
using CostcoReceipts.Api.Models;
using CostcoReceipts.Api.Services;
using Microsoft.AspNetCore.Authorization;

namespace CostcoReceipts.Api.Authorization;

/// <summary>
/// Authorization requirement for receipt role-based access control.
/// </summary>
public class ReceiptRoleRequirement : IAuthorizationRequirement
{
    public string[] AllowedRoles { get; }

    public ReceiptRoleRequirement(params string[] allowedRoles)
    {
        AllowedRoles = allowedRoles;
    }
}

/// <summary>
/// Authorization handler that checks if the current user has the required role for a receipt.
/// Queries DynamoDB to get the user's membership and role for the receipt.
/// </summary>
public class ReceiptRoleAuthorizationHandler : AuthorizationHandler<ReceiptRoleRequirement>
{
    private readonly ISingleTableService _singleTableService;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<ReceiptRoleAuthorizationHandler> _logger;

    public ReceiptRoleAuthorizationHandler(
        ISingleTableService singleTableService,
        IHttpContextAccessor httpContextAccessor,
        ILogger<ReceiptRoleAuthorizationHandler> logger)
    {
        _singleTableService = singleTableService;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ReceiptRoleRequirement requirement)
    {
        // Extract userId from JWT claims
        var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                     ?? context.User.FindFirst("sub")?.Value;

        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("No user ID found in claims for receipt authorization");
            context.Fail();
            return;
        }

        // Extract receiptId from route values
        var httpContext = _httpContextAccessor.HttpContext;
        var receiptId = httpContext?.Request.RouteValues["receiptId"]?.ToString();

        if (string.IsNullOrEmpty(receiptId))
        {
            _logger.LogWarning("No receiptId found in route for authorization check");
            context.Fail();
            return;
        }

        try
        {
            // Query DynamoDB for user's membership on this receipt
            var membership = await _singleTableService.GetUserReceiptMembershipAsync(userId, receiptId);

            if (membership == null)
            {
                _logger.LogInformation("User {UserId} is not a member of receipt {ReceiptId}", userId, receiptId);
                context.Fail();
                return;
            }

            // Check if user's role is in the allowed roles
            var userRole = membership.Role ?? ReceiptRoles.Editor; // Default to editor for backwards compatibility
            if (requirement.AllowedRoles.Contains(userRole))
            {
                _logger.LogInformation("User {UserId} authorized with role {Role} for receipt {ReceiptId}",
                    userId, userRole, receiptId);
                context.Succeed(requirement);
            }
            else
            {
                _logger.LogInformation("User {UserId} with role {Role} not authorized. Required roles: {RequiredRoles}",
                    userId, userRole, string.Join(", ", requirement.AllowedRoles));
                context.Fail();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking receipt authorization for user {UserId} on receipt {ReceiptId}",
                userId, receiptId);
            context.Fail();
        }
    }
}
