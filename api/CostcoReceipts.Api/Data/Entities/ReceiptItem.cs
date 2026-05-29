namespace CostcoReceipts.Api.Data.Entities;

public class ReceiptItem
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public int ItemIndex { get; set; }
    public string? ItemNumber { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? Discount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public Receipt Receipt { get; set; } = null!;
    public List<ReceiptItemAssignment> Assignments { get; set; } = new();
}
