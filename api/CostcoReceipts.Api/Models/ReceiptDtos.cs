using System.Text.Json;
using CostcoReceipts.Api.Data.Entities;

namespace CostcoReceipts.Api.Models;

// Response DTOs shaped for the frontend.
// Identity fields (UserId, DisplayName, Email) come through the linked Contact,
// which lives in the receipt owner's address book — except the name of a
// member with an account, which is theirs (see MemberNames).

/// <summary>
/// The name a receipt member is shown under. A member with an account shows
/// the name they chose through <c>/api/me</c>, whatever the receipt owner
/// called their contact: the contact's name is the owner's label, and only a
/// placeholder shows it. The exception is an account still standing in its
/// sub for a name (see <see cref="MeDto.NeedsName"/>), where the owner's
/// label is the better of the two.
/// </summary>
public static class MemberNames
{
    /// <summary>Requires <see cref="Contact.User"/> to be loaded.</summary>
    public static string Of(Contact? contact)
    {
        if (contact is null) return string.Empty;
        var user = contact.User;
        return user is not null && user.DisplayName != user.UserId
            ? user.DisplayName
            : contact.DisplayName;
    }
}

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

    /// <summary>
    /// Requires the ReceiptMember to be loaded with
    /// .Include(m => m.Contact).ThenInclude(c => c.User).
    /// </summary>
    public static ReceiptMemberDto From(ReceiptMember m) => new()
    {
        Id = m.Id,
        ReceiptId = m.ReceiptId,
        ContactId = m.ContactId,
        UserId = m.Contact?.UserId,
        DisplayName = MemberNames.Of(m.Contact),
        Email = m.Contact?.Email,
        Role = m.Role,
        AddedByMemberId = m.AddedByMemberId,
        AddedAt = m.AddedAt,
        UpdatedAt = m.UpdatedAt,
    };
}

/// <summary>
/// Receipt-level metadata — currently just enough for the frontend to know
/// whether OCR has finished, without tacking a receipt-lifecycle field onto
/// an unrelated sub-resource (members, items, geometry). Also the natural
/// home for future receipt-level fields (e.g. a nickname, see redesign-plan.md).
/// </summary>
public class ReceiptSummaryDto
{
    public string ReceiptId { get; set; } = string.Empty;
    /// <summary>One of <see cref="ReceiptProcessingStatus"/>.</summary>
    public string ProcessingStatus { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    public static ReceiptSummaryDto From(Receipt r) => new()
    {
        ReceiptId = r.ReceiptId,
        ProcessingStatus = r.ProcessingStatus,
        CreatedAt = r.CreatedAt,
    };
}

// ---- Geometry (unchanged) ----

public class GeometryDto
{
    public GeometryFieldDto? Subtotal { get; set; }
    public GeometryFieldDto? Tax { get; set; }
    public GeometryFieldDto? Total { get; set; }
    public SubtotalMatchDto SubtotalMatch { get; set; } = new();

    public static GeometryDto From(IEnumerable<ReceiptGeometry> rows, decimal calculatedSubtotal)
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

        dto.SubtotalMatch = SubtotalMatchDto.Compute(dto.Subtotal?.Value?.Text, calculatedSubtotal);
        return dto;
    }
}

/// <summary>
/// Server-computed comparison of the OCR'd subtotal against the sum of the
/// receipt's items. <see cref="Matches"/>/<see cref="OcrSubtotal"/>/
/// <see cref="Difference"/> are all null when Textract has no subtotal field
/// or it's unparseable — the frontend renders that as "unverified", not a
/// false mismatch.
/// </summary>
public class SubtotalMatchDto
{
    public decimal? OcrSubtotal { get; set; }
    public decimal CalculatedSubtotal { get; set; }
    public decimal? Difference { get; set; }
    public bool? Matches { get; set; }

    public static SubtotalMatchDto Compute(string? ocrSubtotalText, decimal calculatedSubtotal)
    {
        var ocr = ReceiptCalculations.ParseCurrency(ocrSubtotalText);
        return new SubtotalMatchDto
        {
            OcrSubtotal = ocr,
            CalculatedSubtotal = calculatedSubtotal,
            Difference = ocr.HasValue ? Math.Abs(ocr.Value - calculatedSubtotal) : null,
            Matches = ocr.HasValue ? Math.Abs(ocr.Value - calculatedSubtotal) <= ReceiptCalculations.SubtotalTolerance : null,
        };
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

/// <summary>
/// A member as anyone holding a share link sees them: enough to label items
/// and totals, and nothing else. No email and no Auth0 sub, since the
/// viewer may be anyone the link was forwarded to.
/// </summary>
public class SharedMemberDto
{
    public long Id { get; set; }
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Requires .Include(m => m.Contact).ThenInclude(c => c.User).</summary>
    public static SharedMemberDto From(ReceiptMember m) => new()
    {
        Id = m.Id,
        DisplayName = MemberNames.Of(m.Contact),
    };
}

/// <summary>Values of <c>Kind</c> on the two shared-receipt responses.</summary>
public static class SharedReceiptKinds
{
    /// <summary>The receipt itself, as anyone with the link sees it.</summary>
    public const string Public = "public";

    /// <summary>The caller is a member, so the client opens the receipt in the app instead.</summary>
    public const string Member = "member";
}

public class SharedReceiptResponse
{
    public string Kind { get; set; } = SharedReceiptKinds.Public;
    public string ReceiptId { get; set; } = string.Empty;
    public List<ReceiptItemDto> Items { get; set; } = new();
    public List<SharedMemberDto> Members { get; set; } = new();
    public GeometryDto Geometry { get; set; } = new();
    public ShareInfoDto ShareInfo { get; set; } = new();
}

/// <summary>
/// Returned instead of <see cref="SharedReceiptResponse"/> when the caller is
/// signed in and already a member of the link's receipt.
/// </summary>
public class SharedReceiptMemberResponse
{
    public string Kind { get; set; } = SharedReceiptKinds.Member;
    public string ReceiptId { get; set; } = string.Empty;
}

/// <summary>
/// The caller's own profile, read from their users row — the same name every
/// receipt they're on shows (see <see cref="MemberNames"/>).
/// </summary>
public class MeDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    /// <summary>
    /// The name is still the sub, standing in because the /userinfo fetch
    /// failed. The client prompts for a real one.
    /// </summary>
    public bool NeedsName { get; set; }

    public static MeDto From(User user) => new()
    {
        UserId = user.UserId,
        DisplayName = user.DisplayName,
        Email = user.Email,
        NeedsName = user.DisplayName == user.UserId,
    };
}
