namespace CostcoReceipts.Api.Data.Entities;

/// <summary>
/// An authenticated user. Keyed by the Auth0 subject claim.
/// Provisioned by <c>UserProvisioningMiddleware</c> on every authenticated
/// request; placeholder participants do not have a User row.
/// </summary>
public class User
{
    public string UserId { get; set; } = string.Empty;   // Auth0 "sub" claim
    public string? Email { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime LastSeenAt { get; set; }

    public List<Contact> ContactsOwnedByMe { get; set; } = new();
    public List<Contact> ContactsThatAreMe { get; set; } = new();
}
