namespace CostcoReceipts.Api.Models;

// Request DTOs for the receipts API.

public class GetUploadUrlRequest
{
    public string? ContentType { get; set; }
}

public class GetUploadUrlResponse
{
    public string ReceiptId { get; set; } = string.Empty;
    public string UploadUrl { get; set; } = string.Empty;
    public int ExpiresIn { get; set; }
}

public class GetDownloadUrlResponse
{
    public string DownloadUrl { get; set; } = string.Empty;
    public int ExpiresIn { get; set; }
}

/// <summary>
/// Add someone to a receipt: either an existing contact from the receipt
/// owner's address book (<see cref="ContactId"/>), or a new person by name
/// (<see cref="DisplayName"/>), who becomes a fresh placeholder contact
/// there. Exactly one of the two. A name is never matched against existing
/// contacts — two "John"s are two Johns — so reusing a contact is always the
/// caller's explicit choice.
/// </summary>
public class AddReceiptMemberRequest
{
    public long? ContactId { get; set; }
    public string? DisplayName { get; set; }
    /// <summary>Defaults to editor.</summary>
    public string? Role { get; set; }
}

public class UpdateMemberRoleRequest
{
    public string Role { get; set; } = string.Empty;
}

public class UpdateItemAssignmentRequest
{
    /// <summary>ReceiptMember ids (not user ids). Replaces the current assignment set.</summary>
    public List<long> AssignedMemberIds { get; set; } = new();
}

public class BulkUpdateItemAssignmentsRequest
{
    public List<ItemAssignmentUpdate> Updates { get; set; } = new();
}

public class ItemAssignmentUpdate
{
    public long ItemId { get; set; }
    public List<long> AssignedMemberIds { get; set; } = new();
}

public class CreateReceiptShareRequest
{
    public int? ExpiresInDays { get; set; }
}

public class CreateReceiptShareResponse
{
    public string ShareToken { get; set; } = string.Empty;
    public string ShareUrl { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
}

public class ReceiptShareDto
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public string ShareToken { get; set; } = string.Empty;
    public string ShareUrl { get; set; } = string.Empty;
    public string OwnerUserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsActive { get; set; }
    public int CurrentUses { get; set; }
}

public class UpdateMeRequest
{
    public string DisplayName { get; set; } = string.Empty;
}
