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

    /// <summary>S3 key of the uploaded image, set at upload time with the
    /// extension its content type implies. Rows predating this column were
    /// backfilled by the AddReceiptImageKey migration; null only for a row
    /// written by an older API image during a rollback, which is why readers
    /// go through ReceiptsController.ImageKeyOf rather than this directly.</summary>
    public string? ImageKey { get; set; }

    public User Owner { get; set; } = null!;
    public List<ReceiptItem> Items { get; set; } = new();
    public List<ReceiptMember> Members { get; set; } = new();
    public List<ReceiptGeometry> Geometry { get; set; } = new();
    public List<ReceiptShare> Shares { get; set; } = new();
}
