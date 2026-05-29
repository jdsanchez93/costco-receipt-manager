namespace CostcoReceipts.Api.Data.Entities;

public class ReceiptShare
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public string ShareToken { get; set; } = string.Empty;
    public string OwnerUserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsActive { get; set; } = true;
    public int CurrentUses { get; set; }

    public Receipt Receipt { get; set; } = null!;
}
