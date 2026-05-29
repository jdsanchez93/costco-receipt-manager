namespace CostcoReceipts.Api.Data.Entities;

public class ReceiptItemAssignment
{
    public long ReceiptItemId { get; set; }
    public string UserId { get; set; } = string.Empty;

    public ReceiptItem ReceiptItem { get; set; } = null!;
}
