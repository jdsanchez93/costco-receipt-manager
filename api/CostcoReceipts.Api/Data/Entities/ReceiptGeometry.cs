namespace CostcoReceipts.Api.Data.Entities;

public class ReceiptGeometry
{
    public long Id { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
    public string FieldName { get; set; } = string.Empty;
    public string FieldType { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public double Confidence { get; set; }

    public double BoundingBoxWidth { get; set; }
    public double BoundingBoxHeight { get; set; }
    public double BoundingBoxLeft { get; set; }
    public double BoundingBoxTop { get; set; }

    public string PolygonJson { get; set; } = "[]";

    public DateTime CreatedAt { get; set; }

    public Receipt Receipt { get; set; } = null!;
}
