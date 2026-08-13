using System.Text.Json;
using CostcoReceipts.Api.Data.Entities;

namespace CostcoReceipts.Api.Models;

// Response DTOs shaped for the frontend.
// Identity fields (UserId, DisplayName, Email) come through the linked Contact,
// which lives in the receipt owner's address book.

public class ReceiptItemDto
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public int ItemIndex { get; set; }
    public string? ItemNumber { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? Discount { get; set; }
    /// <summary>ReceiptMember ids (not user ids) assigned to this item.</summary>
    public List<long> AssignedMemberIds { get; set; } = new();
    public DateTime CreatedAt { get; set; }

    public static ReceiptItemDto From(ReceiptItem item) => new()
    {
        Id = item.Id,
        ReceiptId = item.ReceiptId,
        ItemIndex = item.ItemIndex,
        ItemNumber = item.ItemNumber,
        ItemName = item.ItemName,
        Price = item.Price,
        Discount = item.Discount,
        AssignedMemberIds = item.Assignments.Select(a => a.ReceiptMemberId).ToList(),
        CreatedAt = item.CreatedAt,
    };
}

public class ReceiptMemberDto
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public long ContactId { get; set; }
    /// <summary>Auth0 sub if this member is an authenticated user; null for placeholders.</summary>
    public string? UserId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Role { get; set; } = string.Empty;
    public long? AddedByMemberId { get; set; }
    public DateTime AddedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? ValidationStatus { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public string? Comments { get; set; }

    /// <summary>Requires the ReceiptMember to be loaded with .Include(m => m.Contact).</summary>
    public static ReceiptMemberDto From(ReceiptMember m) => new()
    {
        Id = m.Id,
        ReceiptId = m.ReceiptId,
        ContactId = m.ContactId,
        UserId = m.Contact?.UserId,
        DisplayName = m.Contact?.DisplayName ?? string.Empty,
        Email = m.Contact?.Email,
        Role = m.Role,
        AddedByMemberId = m.AddedByMemberId,
        AddedAt = m.AddedAt,
        UpdatedAt = m.UpdatedAt,
        ValidationStatus = m.ValidationStatus,
        ValidatedAt = m.ValidatedAt,
        Comments = m.Comments,
    };
}

// ---- Geometry (unchanged) ----

public class GeometryDto
{
    public GeometryFieldDto? Subtotal { get; set; }
    public GeometryFieldDto? Tax { get; set; }
    public GeometryFieldDto? Total { get; set; }

    public static GeometryDto From(IEnumerable<ReceiptGeometry> rows)
    {
        var dto = new GeometryDto();
        foreach (var row in rows)
        {
            var entry = GeometryEntryDto.From(row);
            var field = row.FieldName.ToLowerInvariant() switch
            {
                "subtotal" => dto.Subtotal ??= new GeometryFieldDto(),
                "tax" => dto.Tax ??= new GeometryFieldDto(),
                "total" => dto.Total ??= new GeometryFieldDto(),
                _ => null,
            };

            if (field is null) continue;

            if (string.Equals(row.FieldType, "label", StringComparison.OrdinalIgnoreCase))
                field.Label = entry;
            else if (string.Equals(row.FieldType, "value", StringComparison.OrdinalIgnoreCase))
                field.Value = entry;
        }
        return dto;
    }
}

public class GeometryFieldDto
{
    public GeometryEntryDto? Label { get; set; }
    public GeometryEntryDto? Value { get; set; }
}

public class GeometryEntryDto
{
    public string Text { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public BoundingBoxDto BoundingBox { get; set; } = new();
    public List<PointDto> Polygon { get; set; } = new();

    public static GeometryEntryDto From(ReceiptGeometry row) => new()
    {
        Text = row.Text,
        Confidence = row.Confidence,
        BoundingBox = new BoundingBoxDto
        {
            Width = row.BoundingBoxWidth,
            Height = row.BoundingBoxHeight,
            Left = row.BoundingBoxLeft,
            Top = row.BoundingBoxTop,
        },
        Polygon = ParsePolygon(row.PolygonJson),
    };

    private static List<PointDto> ParsePolygon(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            return JsonSerializer.Deserialize<List<PointDto>>(json, JsonOpts) ?? new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };
}

public class BoundingBoxDto
{
    public double Width { get; set; }
    public double Height { get; set; }
    public double Left { get; set; }
    public double Top { get; set; }
}

public class PointDto
{
    public double X { get; set; }
    public double Y { get; set; }
}

public class ShareInfoDto
{
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
}

public class SharedReceiptResponse
{
    public string ReceiptId { get; set; } = string.Empty;
    public List<ReceiptItemDto> Items { get; set; } = new();
    public List<ReceiptMemberDto> Members { get; set; } = new();
    public GeometryDto Geometry { get; set; } = new();
    public ShareInfoDto ShareInfo { get; set; } = new();
}
