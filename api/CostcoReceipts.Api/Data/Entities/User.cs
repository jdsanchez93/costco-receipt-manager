namespace CostcoReceipts.Api.Data.Entities;

/// <summary>
/// An authenticated user. Keyed by the Auth0 subject claim.
/// Provisioned by <c>UserProvisioningMiddleware</c> on every authenticated
/// request; placeholder participants do not have a User row.
///
/// Email and DisplayName are filled from Auth0's /userinfo, with the subject
/// standing in for DisplayName and the fetch retried while Email is missing.
/// Neither is overwritten from Auth0 once set — the name is the user's to
/// change via <c>/api/me</c>, which keeps it in step with their self-contact.
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
