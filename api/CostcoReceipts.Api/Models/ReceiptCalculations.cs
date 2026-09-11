using System.Globalization;

namespace CostcoReceipts.Api.Models;

public static class ReceiptCalculations
{
    public const decimal SubtotalTolerance = 0.01m;

    public static decimal Sum(IEnumerable<ReceiptItemDto> items) =>
        items.Sum(i => i.Price - (i.Discount ?? 0));

    /// <summary>
    /// Parses Textract's OCR text for a currency field (e.g. "$1,234.56") into
    /// a decimal. Returns null when the field is missing or unparseable.
    /// </summary>
    public static decimal? ParseCurrency(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;

        var cleaned = new string(text.Where(c => char.IsDigit(c) || c is '.' or '-').ToArray());
        return decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }
}
