namespace CostcoReceipts.Api.Models;

// Request DTOs for the receipts API.
// Response shapes live in ReceiptDtos.cs.

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

public class AddReceiptMemberRequest
{
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string UserType { get; set; } = "authenticated"; // authenticated | placeholder
    public string? Role { get; set; }                       // owner | editor (defaults to editor)
}

public class UpdateMemberDetailsRequest
{
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
}

public class UpdateMemberRoleRequest
{
    public string Role { get; set; } = string.Empty; // owner | editor
}

public class UpdateItemAssignmentRequest
{
    public List<string> AssignedUsers { get; set; } = new();
}

public class BulkUpdateItemAssignmentsRequest
{
    public List<ItemAssignmentUpdate> Updates { get; set; } = new();
}

public class ItemAssignmentUpdate
{
    public long ItemId { get; set; }
    public List<string> AssignedUsers { get; set; } = new();
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
