namespace CostcoReceipts.Api.Data.Entities;

public class Receipt
{
    public string ReceiptId { get; set; } = string.Empty;
    public string OwnerUserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public User Owner { get; set; } = null!;
    public List<ReceiptItem> Items { get; set; } = new();
    public List<ReceiptMember> Members { get; set; } = new();
    public List<ReceiptGeometry> Geometry { get; set; } = new();
    public List<ReceiptShare> Shares { get; set; } = new();
}
