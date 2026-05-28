namespace CostcoReceipts.Api.Models;

// Request/Response DTOs for API endpoints
// Note: ASP.NET Core defaults to camelCase for JSON serialization

// Upload URL Request/Response
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

// Download URL Response
public class GetDownloadUrlResponse
{
    public string DownloadUrl { get; set; } = string.Empty;
    public int ExpiresIn { get; set; }
}

// Add Member Request
public class AddReceiptMemberRequest
{
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string UserType { get; set; } = "authenticated";  // authenticated | placeholder
    public string? Role { get; set; }  // owner | editor | viewer (defaults to editor)
}

// Update Member Role Request
public class UpdateMemberRoleRequest
{
    public string Role { get; set; } = string.Empty;  // owner | editor | viewer
}

// Update Member Details Request
public class UpdateMemberDetailsRequest
{
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
}

// Update Item Assignment Request
public class UpdateItemAssignmentRequest
{
    public List<string> AssignedUsers { get; set; } = new();
}

// Bulk Update Item Assignments Request
public class BulkUpdateItemAssignmentsRequest
{
    public List<ItemAssignmentUpdate> Updates { get; set; } = new();
}

public class ItemAssignmentUpdate
{
    public string ItemId { get; set; } = string.Empty;
    public List<string> AssignedUsers { get; set; } = new();
}

// Create Receipt Share Request
public class CreateReceiptShareRequest
{
    public int ExpiresInDays { get; set; } = 30;
}

// Validate Receipt Request
public class ValidateReceiptRequest
{
    public bool IsValid { get; set; }
    public string? Comments { get; set; }
}

// Shared Receipt Response
public class SharedReceiptResponse
{
    public string ReceiptId { get; set; } = string.Empty;
    public List<ReceiptItem> Items { get; set; } = new();
    public List<ReceiptMember> Members { get; set; } = new();
    public Dictionary<string, object> Geometry { get; set; } = new();
    public ShareInfo ShareInfo { get; set; } = new();
}

public class ShareInfo
{
    public string CreatedAt { get; set; } = string.Empty;
    public string ExpiresAt { get; set; } = string.Empty;
}

// Generic API Response
public class ApiResponse<T>
{
    public T? Data { get; set; }
    public string? Message { get; set; }
    public string? Error { get; set; }
}

// Error Response
public class ErrorResponse
{
    public string Error { get; set; } = string.Empty;
    public string? Details { get; set; }
}

// Health Response
public class HealthResponse
{
    public string Status { get; set; } = "healthy";
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string? Environment { get; set; }
}
