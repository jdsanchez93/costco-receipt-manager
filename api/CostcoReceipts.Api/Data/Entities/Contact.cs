namespace CostcoReceipts.Api.Data.Entities;

/// <summary>
/// An entry in an owner's personal address book of receipt participants.
/// Every receipt_members row references exactly one Contact, and every
/// Contact belongs to exactly one owner (its OwnerUserId).
///
/// Two shapes exist:
///  - Authenticated: <see cref="UserId"/> is set and FK-references a User.
///    Owner-scoped unique on (OwnerUserId, UserId), so the same auth user
///    appears at most once in a given owner's address book.
///  - Placeholder: <see cref="UserId"/> is null. Multiple placeholders with
///    the same DisplayName may coexist in one owner's address book (nothing
///    provably distinguishes them).
/// </summary>
public class Contact
{
    public long ContactId { get; set; }
    public string OwnerUserId { get; set; } = string.Empty;
    public string? UserId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public DateTime CreatedAt { get; set; }

    public User Owner { get; set; } = null!;
    public User? User { get; set; }
    public List<ReceiptMember> Memberships { get; set; } = new();
}
