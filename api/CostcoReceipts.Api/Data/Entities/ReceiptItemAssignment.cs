namespace CostcoReceipts.Api.Data.Entities;

/// <summary>
/// Assigns responsibility for a receipt item to a specific member of that
/// receipt. FK-clean: the assignee is always a real receipt_members row,
/// so we can't dangle a reference to a non-member.
/// </summary>
public class ReceiptItemAssignment
{
    public long ReceiptItemId { get; set; }
    public long ReceiptMemberId { get; set; }

    public ReceiptItem ReceiptItem { get; set; } = null!;
    public ReceiptMember ReceiptMember { get; set; } = null!;
}
