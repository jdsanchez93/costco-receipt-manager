using System.Text.Json.Serialization;

namespace CostcoReceipts.Api.Models;

// Request/Response DTOs for API endpoints

// Upload URL Request/Response
public class GetUploadUrlRequest
{
    [JsonPropertyName("contentType")]
    public string? ContentType { get; set; }
}

public class GetUploadUrlResponse
{
    [JsonPropertyName("receiptId")]
    public string ReceiptId { get; set; } = string.Empty;

    [JsonPropertyName("uploadUrl")]
    public string UploadUrl { get; set; } = string.Empty;

    [JsonPropertyName("expiresIn")]
    public int ExpiresIn { get; set; }
}

// Download URL Response
public class GetDownloadUrlResponse
{
    [JsonPropertyName("downloadUrl")]
    public string DownloadUrl { get; set; } = string.Empty;

    [JsonPropertyName("expiresIn")]
    public int ExpiresIn { get; set; }
}

// Add Member Request
public class AddReceiptMemberRequest
{
    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("userType")]
    public string UserType { get; set; } = "authenticated";  // authenticated | placeholder
}

// Update Member Details Request
public class UpdateMemberDetailsRequest
{
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string? Name { get; set; }
}

// Update Item Assignment Request
public class UpdateItemAssignmentRequest
{
    [JsonPropertyName("assignedUsers")]
    public List<string> AssignedUsers { get; set; } = new();
}

// Bulk Update Item Assignments Request
public class BulkUpdateItemAssignmentsRequest
{
    [JsonPropertyName("updates")]
    public List<ItemAssignmentUpdate> Updates { get; set; } = new();
}

public class ItemAssignmentUpdate
{
    [JsonPropertyName("itemId")]
    public string ItemId { get; set; } = string.Empty;

    [JsonPropertyName("assignedUsers")]
    public List<string> AssignedUsers { get; set; } = new();
}

// Create Receipt Share Request
public class CreateReceiptShareRequest
{
    [JsonPropertyName("expiresInDays")]
    public int ExpiresInDays { get; set; } = 30;
}

// Validate Receipt Request
public class ValidateReceiptRequest
{
    [JsonPropertyName("isValid")]
    public bool IsValid { get; set; }

    [JsonPropertyName("comments")]
    public string? Comments { get; set; }
}

// Shared Receipt Response
public class SharedReceiptResponse
{
    [JsonPropertyName("receiptId")]
    public string ReceiptId { get; set; } = string.Empty;

    [JsonPropertyName("items")]
    public List<ReceiptItem> Items { get; set; } = new();

    [JsonPropertyName("members")]
    public List<ReceiptMember> Members { get; set; } = new();

    [JsonPropertyName("geometry")]
    public Dictionary<string, object> Geometry { get; set; } = new();

    [JsonPropertyName("shareInfo")]
    public ShareInfo ShareInfo { get; set; } = new();
}

public class ShareInfo
{
    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;

    [JsonPropertyName("expiresAt")]
    public string ExpiresAt { get; set; } = string.Empty;
}

// Generic API Response
public class ApiResponse<T>
{
    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

// Error Response
public class ErrorResponse
{
    [JsonPropertyName("error")]
    public string Error { get; set; } = string.Empty;

    [JsonPropertyName("details")]
    public string? Details { get; set; }
}

// Health Response
public class HealthResponse
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "healthy";

    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("environment")]
    public string? Environment { get; set; }
}