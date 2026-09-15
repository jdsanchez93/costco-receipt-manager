namespace CostcoReceipts.Api.Models;

/// <summary>
/// Payload the receipt-processor Lambda POSTs after running Textract OCR
/// on a newly uploaded receipt image.
/// </summary>
public class OcrResultsRequest
{
    public List<OcrItemDto> Items { get; set; } = new();
    public List<OcrGeometryDto> Geometry { get; set; } = new();
}

public class OcrItemDto
{
    public string? ItemNumber { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? Discount { get; set; }
    public string? TaxCode { get; set; }
}

public class OcrGeometryDto
{
    public string FieldName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public BoundingBoxDto BoundingBox { get; set; } = new();
    public List<PointDto> Polygon { get; set; } = new();
}
