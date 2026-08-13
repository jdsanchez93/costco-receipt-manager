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

public class ValidateReceiptRequest
{
    public bool IsValid { get; set; }
    public string? Comments { get; set; }
}

/// <summary>
/// Add a placeholder participant to a receipt. Always creates a fresh
/// placeholder Contact in the receipt owner's address book (nothing gets
/// deduped by display name — two "John"s are two Johns).
///
/// Adding an authenticated user by picking from the owner's existing
/// contacts is a future flow that will use its own endpoint.
/// </summary>
public class AddReceiptMemberRequest
{
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Role { get; set; }
}

public class UpdateMemberDetailsRequest
{
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
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
