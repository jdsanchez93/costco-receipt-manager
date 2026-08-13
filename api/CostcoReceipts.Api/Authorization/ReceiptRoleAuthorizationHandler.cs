using System.Security.Claims;
using CostcoReceipts.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Authorization;

/// <summary>
/// Resolves whether the current user holds an allowed role on the receipt
/// identified by the <c>receiptId</c> route value.
/// </summary>
public class ReceiptRoleAuthorizationHandler : AuthorizationHandler<ReceiptRoleRequirement>
{
    private readonly AppDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<ReceiptRoleAuthorizationHandler> _logger;

    public ReceiptRoleAuthorizationHandler(
        AppDbContext db,
        IHttpContextAccessor httpContextAccessor,
        ILogger<ReceiptRoleAuthorizationHandler> logger)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ReceiptRoleRequirement requirement)
    {
        var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? context.User.FindFirst("sub")?.Value;

        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("Receipt authorization: no user id in claims");
            return; // not calling Fail() lets other handlers run; AuthZ ultimately denies
        }

        var receiptId = _httpContextAccessor.HttpContext?.Request.RouteValues["receiptId"]?.ToString();

        if (string.IsNullOrEmpty(receiptId))
        {
            _logger.LogWarning("Receipt authorization: no receiptId in route");
            return;
        }

        var ct = _httpContextAccessor.HttpContext?.RequestAborted ?? CancellationToken.None;

        // Membership is now indirect via Contact — the caller is a member of the
        // receipt if any receipt_members row for this receipt has a Contact whose
        // UserId matches the caller's Auth0 sub.
        var role = await _db.ReceiptMembers
            .AsNoTracking()
            .Where(m => m.ReceiptId == receiptId && m.Contact.UserId == userId)
            .Select(m => m.Role)
            .FirstOrDefaultAsync(ct);

        if (role is null)
        {
            _logger.LogInformation(
                "Receipt authorization: user {UserId} is not a member of receipt {ReceiptId}",
                userId, receiptId);
            return;
        }

        if (requirement.AllowedRoles.Contains(role))
        {
            context.Succeed(requirement);
            return;
        }

        _logger.LogInformation(
            "Receipt authorization: user {UserId} has role {Role}, required one of [{Required}]",
            userId, role, string.Join(", ", requirement.AllowedRoles));
    }
}
