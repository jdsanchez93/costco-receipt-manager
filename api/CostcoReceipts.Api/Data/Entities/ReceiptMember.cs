namespace CostcoReceipts.Api.Data.Entities;

public class ReceiptMember
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string? PlaceholderId { get; set; }
    public string UserType { get; set; } = "authenticated";
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string AddedBy { get; set; } = string.Empty;
    public DateTime AddedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public string? ValidationStatus { get; set; }
    public string? ValidatedBy { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public string? Comments { get; set; }

    public Receipt Receipt { get; set; } = null!;
}
