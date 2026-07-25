using System.Text.Json;
using Amazon.DynamoDBv2.Model;
using CostcoReceipts.Api.Data.Entities;

namespace CostcoReceipts.Migration;

/// <summary>
/// Converts raw DynamoDB items (Dictionary&lt;string, AttributeValue&gt;) from the
/// legacy single-table schema into EF Core entities matching the new MySQL schema.
/// </summary>
internal static class DynamoMappers
{
    // ---------- ReceiptMember ----------

    public static ReceiptMember ToReceiptMember(Dictionary<string, AttributeValue> item) => new()
    {
        ReceiptId = S(item, "receipt_id"),
        UserId = S(item, "user_id"),
        PlaceholderId = SOrNull(item, "placeholder_id"),
        UserType = S(item, "user_type", "authenticated"),
        // Role is not present in old data; the Migrator backfills it after grouping.
        Role = "editor",
        DisplayName = S(item, "display_name"),
        Email = SOrNull(item, "email"),
        AddedBy = S(item, "added_by"),
        AddedAt = ParseUtcDate(SOrNull(item, "added_at")) ?? DateTime.UtcNow,
        UpdatedAt = ParseUtcDate(SOrNull(item, "updated_at")),
        ValidationStatus = SOrNull(item, "validation_status"),
        ValidatedBy = SOrNull(item, "validated_by"),
        ValidatedAt = ParseUtcDate(SOrNull(item, "validated_at")),
        Comments = SOrNull(item, "comments"),
    };

    // ---------- ReceiptItem (returns entity + assigned user ids) ----------

    public static (ReceiptItem Item, IReadOnlyList<string> AssignedUsers) ToReceiptItem(
        Dictionary<string, AttributeValue> item)
    {
        var sk = S(item, "SK"); // "ITEM#{item_index}"
        var indexStr = sk.StartsWith("ITEM#") ? sk["ITEM#".Length..] : sk;
        _ = int.TryParse(indexStr, out var itemIndex);

        var entity = new ReceiptItem
        {
            // Id is a synthetic auto-increment — leave 0, EF will assign.
            ReceiptId = S(item, "receipt_id"),
            ItemIndex = itemIndex,
            ItemNumber = SOrNull(item, "item_number"),
            ItemName = S(item, "item_name"),
            Price = N(item, "price"),
            Discount = NOrNull(item, "discount"),
            CreatedAt = ParseUtcDate(SOrNull(item, "created_at")) ?? DateTime.UtcNow,
            UpdatedAt = ParseUtcDate(SOrNull(item, "updated_at")),
        };

        var assignedUsers = StringList(item, "assigned_users");
        return (entity, assignedUsers);
    }

    // ---------- ReceiptGeometry ----------

    public static ReceiptGeometry ToReceiptGeometry(Dictionary<string, AttributeValue> item)
    {
        var bb = MapOrEmpty(item, "bounding_box");
        var polygonList = ListOfMaps(item, "polygon");
        var polygonJson = JsonSerializer.Serialize(
            polygonList.Select(p => new
            {
                x = MapNumber(p, "x"),
                y = MapNumber(p, "y"),
            }).ToList());

        return new ReceiptGeometry
        {
            ReceiptId = S(item, "receipt_id"),
            FieldName = S(item, "field_name"),
            FieldType = S(item, "field_type"),
            Text = S(item, "text"),
            Confidence = NDouble(item, "confidence"),
            BoundingBoxWidth = MapNumber(bb, "width"),
            BoundingBoxHeight = MapNumber(bb, "height"),
            BoundingBoxLeft = MapNumber(bb, "left"),
            BoundingBoxTop = MapNumber(bb, "top"),
            PolygonJson = polygonJson,
            CreatedAt = ParseUtcDate(SOrNull(item, "created_at")) ?? DateTime.UtcNow,
        };
    }

    // ---------- ReceiptShare ----------

    public static ReceiptShare ToReceiptShare(Dictionary<string, AttributeValue> item)
    {
        var expiresAtUnix = NLong(item, "expires_at");
        var expiresAt = expiresAtUnix > 0
            ? DateTimeOffset.FromUnixTimeSeconds(expiresAtUnix).UtcDateTime
            : DateTime.UtcNow;

        return new ReceiptShare
        {
            ReceiptId = S(item, "receipt_id"),
            ShareToken = S(item, "share_token"),
            OwnerUserId = S(item, "owner_user_id"),
            CreatedAt = ParseUtcDate(SOrNull(item, "created_at")) ?? DateTime.UtcNow,
            ExpiresAt = expiresAt,
            IsActive = BOrDefault(item, "is_active", true),
            CurrentUses = (int)NLong(item, "current_uses"),
        };
    }

    // ---------- PlaceholderUser ----------

    public static PlaceholderUser ToPlaceholderUser(Dictionary<string, AttributeValue> item) => new()
    {
        ReceiptId = S(item, "receipt_id"),
        PlaceholderId = S(item, "placeholder_id"),
        DisplayName = S(item, "display_name"),
        Status = S(item, "status", "unclaimed"),
        CreatedAt = ParseUtcDate(SOrNull(item, "created_at")) ?? DateTime.UtcNow,
    };

    // ============================================================
    // Low-level attribute accessors
    // ============================================================

    private static string S(Dictionary<string, AttributeValue> item, string key, string fallback = "") =>
        item.TryGetValue(key, out var v) && v.S is not null ? v.S : fallback;

    private static string? SOrNull(Dictionary<string, AttributeValue> item, string key) =>
        item.TryGetValue(key, out var v) ? v.S : null;

    private static decimal N(Dictionary<string, AttributeValue> item, string key) =>
        item.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v.N)
            ? decimal.Parse(v.N, System.Globalization.CultureInfo.InvariantCulture)
            : 0m;

    private static decimal? NOrNull(Dictionary<string, AttributeValue> item, string key) =>
        item.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v.N)
            ? decimal.Parse(v.N, System.Globalization.CultureInfo.InvariantCulture)
            : null;

    private static double NDouble(Dictionary<string, AttributeValue> item, string key) =>
        item.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v.N)
            ? double.Parse(v.N, System.Globalization.CultureInfo.InvariantCulture)
            : 0d;

    private static long NLong(Dictionary<string, AttributeValue> item, string key) =>
        item.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v.N)
            ? long.Parse(v.N, System.Globalization.CultureInfo.InvariantCulture)
            : 0L;

    private static bool BOrDefault(Dictionary<string, AttributeValue> item, string key, bool fallback) =>
        item.TryGetValue(key, out var v) && v.IsBOOLSet ? v.BOOL ?? fallback : fallback;

    private static IReadOnlyList<string> StringList(Dictionary<string, AttributeValue> item, string key)
    {
        if (!item.TryGetValue(key, out var v)) return [];
        // Could be an L of S entries, or an SS (string set) depending on how data was written.
        if (v.IsLSet) return v.L.Where(x => x.S is not null).Select(x => x.S!).ToList();
        if (v.SS is { Count: > 0 }) return v.SS;
        return [];
    }

    private static Dictionary<string, AttributeValue> MapOrEmpty(
        Dictionary<string, AttributeValue> item, string key) =>
        item.TryGetValue(key, out var v) && v.IsMSet ? v.M : new Dictionary<string, AttributeValue>();

    private static IReadOnlyList<Dictionary<string, AttributeValue>> ListOfMaps(
        Dictionary<string, AttributeValue> item, string key)
    {
        if (!item.TryGetValue(key, out var v) || !v.IsLSet) return [];
        return v.L.Where(x => x.IsMSet).Select(x => x.M).ToList();
    }

    private static double MapNumber(Dictionary<string, AttributeValue> map, string key) =>
        map.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v.N)
            ? double.Parse(v.N, System.Globalization.CultureInfo.InvariantCulture)
            : 0d;

    private static DateTime? ParseUtcDate(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        // DynamoDB values were written as ISO-8601 UTC strings.
        if (DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
                out var dt))
        {
            return dt;
        }
        return null;
    }
}
