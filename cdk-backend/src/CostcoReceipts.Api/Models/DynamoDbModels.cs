using Amazon.DynamoDBv2.DataModel;
using System.Text.Json.Serialization;

namespace CostcoReceipts.Api.Models;

// Base interface for all DynamoDB entities
public interface IDynamoDbEntity
{
    string PK { get; set; }
    string SK { get; set; }
    string EntityType { get; set; }
}

// Geometry primitives
public class BoundingBox
{
    public double Width { get; set; }
    public double Height { get; set; }
    public double Left { get; set; }
    public double Top { get; set; }
}

public class Point
{
    public double X { get; set; }
    public double Y { get; set; }
}

// Receipt Item
[DynamoDBTable("")]  // Table name will be set by configuration
public class ReceiptItem : IDynamoDbEntity
{
    [DynamoDBHashKey]
    [JsonPropertyName("PK")]
    public string PK { get; set; } = string.Empty;  // RECEIPT#{receipt_id}

    [DynamoDBRangeKey]
    [JsonPropertyName("SK")]
    public string SK { get; set; } = string.Empty;  // ITEM#{item_id}

    [DynamoDBProperty("entity_type")]
    public string EntityType { get; set; } = "RECEIPT_ITEM";

    [DynamoDBProperty("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [DynamoDBProperty("item_number")]
    public string? ItemNumber { get; set; }

    [DynamoDBProperty("item_name")]
    public string ItemName { get; set; } = string.Empty;

    [DynamoDBProperty("price")]
    public decimal Price { get; set; }

    [DynamoDBProperty("discount")]
    public decimal? Discount { get; set; }

    [DynamoDBProperty("assigned_users")]
    public List<string> AssignedUsers { get; set; } = new();

    [DynamoDBProperty("created_at")]
    public string CreatedAt { get; set; } = string.Empty;

    [DynamoDBProperty("updated_at")]
    public string? UpdatedAt { get; set; }
}

// Receipt Member
[DynamoDBTable("")]
public class ReceiptMember : IDynamoDbEntity
{
    [DynamoDBHashKey]
    [JsonPropertyName("PK")]
    public string PK { get; set; } = string.Empty;  // RECEIPT#{receipt_id}

    [DynamoDBRangeKey]
    [JsonPropertyName("SK")]
    public string SK { get; set; } = string.Empty;  // USER#{user_id}

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1")]
    [JsonPropertyName("GSI1PK")]
    public string GSI1PK { get; set; } = string.Empty;  // USER#{user_id}

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1")]
    [JsonPropertyName("GSI1SK")]
    public string GSI1SK { get; set; } = string.Empty;  // RECEIPT#{receipt_id}

    [DynamoDBProperty("entity_type")]
    public string EntityType { get; set; } = "RECEIPT_MEMBER";

    [DynamoDBProperty("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [DynamoDBProperty("user_id")]
    public string UserId { get; set; } = string.Empty;

    [DynamoDBProperty("placeholder_id")]
    public string? PlaceholderId { get; set; }

    [DynamoDBProperty("user_type")]
    public string UserType { get; set; } = string.Empty;  // 'authenticated' | 'placeholder'

    [DynamoDBProperty("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [DynamoDBProperty("email")]
    public string? Email { get; set; }

    [DynamoDBProperty("added_by")]
    public string AddedBy { get; set; } = string.Empty;

    [DynamoDBProperty("added_at")]
    public string AddedAt { get; set; } = string.Empty;

    [DynamoDBProperty("updated_at")]
    public string? UpdatedAt { get; set; }

    // Validation fields
    [DynamoDBProperty("validation_status")]
    public string? ValidationStatus { get; set; }

    [DynamoDBProperty("validated_by")]
    public string? ValidatedBy { get; set; }

    [DynamoDBProperty("validated_at")]
    public string? ValidatedAt { get; set; }

    [DynamoDBProperty("comments")]
    public string? Comments { get; set; }

    // Role-based access control
    [DynamoDBProperty("role")]
    public string Role { get; set; } = ReceiptRoles.Editor;  // "owner" | "editor" | "viewer"
}

// Receipt Share
[DynamoDBTable("")]
public class ReceiptShare : IDynamoDbEntity
{
    [DynamoDBHashKey]
    [JsonPropertyName("PK")]
    public string PK { get; set; } = string.Empty;  // SHARE#{share_token}

    [DynamoDBRangeKey]
    [JsonPropertyName("SK")]
    public string SK { get; set; } = string.Empty;  // RECEIPT#{receipt_id}

    [DynamoDBGlobalSecondaryIndexHashKey("GSI2")]
    [JsonPropertyName("GSI2PK")]
    public string GSI2PK { get; set; } = string.Empty;  // RECEIPT#{receipt_id}

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI2")]
    [JsonPropertyName("GSI2SK")]
    public string GSI2SK { get; set; } = string.Empty;  // SHARE#{share_token}

    [DynamoDBProperty("entity_type")]
    public string EntityType { get; set; } = "RECEIPT_SHARE";

    [DynamoDBProperty("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [DynamoDBProperty("owner_user_id")]
    public string OwnerUserId { get; set; } = string.Empty;

    [DynamoDBProperty("share_token")]
    public string ShareToken { get; set; } = string.Empty;

    [DynamoDBProperty("created_at")]
    public string CreatedAt { get; set; } = string.Empty;

    [DynamoDBProperty("expires_at")]
    public long ExpiresAt { get; set; }  // Unix timestamp

    [DynamoDBProperty("is_active")]
    public bool IsActive { get; set; } = true;

    [DynamoDBProperty("current_uses")]
    public int CurrentUses { get; set; } = 0;

    // Computed properties for API responses (not stored in DynamoDB)
    [DynamoDBIgnore]
    public string? ShareUrl { get; set; }

    [DynamoDBIgnore]
    public string? ExpiresAtIso { get; set; }
}

// Receipt Geometry
[DynamoDBTable("")]
public class ReceiptGeometry : IDynamoDbEntity
{
    [DynamoDBHashKey]
    [JsonPropertyName("PK")]
    public string PK { get; set; } = string.Empty;  // RECEIPT#{receipt_id}

    [DynamoDBRangeKey]
    [JsonPropertyName("SK")]
    public string SK { get; set; } = string.Empty;  // GEOMETRY#{field}#{type}

    [DynamoDBProperty("entity_type")]
    public string EntityType { get; set; } = "RECEIPT_GEOMETRY";

    [DynamoDBProperty("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [DynamoDBProperty("field_name")]
    public string FieldName { get; set; } = string.Empty;  // subtotal, tax, total

    [DynamoDBProperty("field_type")]
    public string FieldType { get; set; } = string.Empty;  // label, value

    [DynamoDBProperty("text")]
    public string Text { get; set; } = string.Empty;

    [DynamoDBProperty("confidence")]
    public double Confidence { get; set; }

    [DynamoDBProperty("bounding_box")]
    public BoundingBox BoundingBox { get; set; } = new();

    [DynamoDBProperty("polygon")]
    public List<Point> Polygon { get; set; } = new();

    [DynamoDBProperty("created_at")]
    public string CreatedAt { get; set; } = string.Empty;
}

// Placeholder User
[DynamoDBTable("")]
public class PlaceholderUser : IDynamoDbEntity
{
    [DynamoDBHashKey]
    [JsonPropertyName("PK")]
    public string PK { get; set; } = string.Empty;  // USER#{placeholder_id}

    [DynamoDBRangeKey]
    [JsonPropertyName("SK")]
    public string SK { get; set; } = string.Empty;  // RECEIPT#{receipt_id}

    [DynamoDBProperty("entity_type")]
    public string EntityType { get; set; } = "PLACEHOLDER_USER";

    [DynamoDBProperty("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [DynamoDBProperty("placeholder_id")]
    public string PlaceholderId { get; set; } = string.Empty;

    [DynamoDBProperty("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [DynamoDBProperty("status")]
    public string Status { get; set; } = "unclaimed";  // unclaimed, claimed

    [DynamoDBProperty("created_at")]
    public string CreatedAt { get; set; } = string.Empty;
}