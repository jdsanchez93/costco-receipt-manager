using CostcoReceipts.Api.Models;

namespace CostcoReceipts.Api.Data.Entities;

public class Receipt
{
    public string ReceiptId { get; set; } = string.Empty;
    public string OwnerUserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    /// <summary>One of <see cref="ReceiptProcessingStatus"/>. Defaults to
    /// "completed" at the DB level so pre-existing rows (created before this
    /// column existed) aren't misread as stuck — new receipts explicitly set
    /// "pending" at upload time (see ReceiptsController.GetUploadUrl).</summary>
    public string ProcessingStatus { get; set; } = ReceiptProcessingStatus.Completed;

    public User Owner { get; set; } = null!;
    public List<ReceiptItem> Items { get; set; } = new();
    public List<ReceiptMember> Members { get; set; } = new();
    public List<ReceiptGeometry> Geometry { get; set; } = new();
    public List<ReceiptShare> Shares { get; set; } = new();
}
