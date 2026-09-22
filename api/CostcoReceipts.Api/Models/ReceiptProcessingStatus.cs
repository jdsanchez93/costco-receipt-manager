namespace CostcoReceipts.Api.Models;

/// <summary>
/// Constants and helpers for a receipt's OCR processing status. Set to
/// <see cref="Pending"/> by <see cref="Controllers.ReceiptsController"/> when
/// the upload URL is issued, then flipped to <see cref="Completed"/> or
/// <see cref="Failed"/> by <see cref="Controllers.InternalController"/> once
/// the receipt-processor Lambda reports in.
/// </summary>
public static class ReceiptProcessingStatus
{
    /// <summary>Uploaded; the Lambda hasn't reported a result yet.</summary>
    public const string Pending = "pending";

    /// <summary>OCR results were parsed and persisted successfully.</summary>
    public const string Completed = "completed";

    /// <summary>The Lambda ran but did not produce usable results.</summary>
    public const string Failed = "failed";

    public static readonly string[] All = [Pending, Completed, Failed];

    public static bool IsValid(string? status) => status is Pending or Completed or Failed;
}
