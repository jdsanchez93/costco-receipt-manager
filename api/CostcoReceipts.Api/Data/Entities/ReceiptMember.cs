namespace CostcoReceipts.Api.Data.Entities;

/// <summary>
/// A membership: one participant (via <see cref="Contact"/>) on one Receipt,
/// with a role and per-receipt state (validation etc.). Identity/display
/// fields live on the Contact — receipt_members carries only membership
/// data.
/// </summary>
public class ReceiptMember
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public long ContactId { get; set; }
    public string Role { get; set; } = "editor";

    public long? AddedByMemberId { get; set; }
    public DateTime AddedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public string? ValidationStatus { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public string? Comments { get; set; }

    public Receipt Receipt { get; set; } = null!;
    public Contact Contact { get; set; } = null!;
    public ReceiptMember? AddedByMember { get; set; }
    public List<ReceiptItemAssignment> Assignments { get; set; } = new();
}
