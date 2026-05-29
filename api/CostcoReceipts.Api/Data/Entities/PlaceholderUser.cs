namespace CostcoReceipts.Api.Data.Entities;

public class PlaceholderUser
{
    public string PlaceholderId { get; set; } = string.Empty;
    public string ReceiptId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Status { get; set; } = "unclaimed";
    public DateTime CreatedAt { get; set; }
}
