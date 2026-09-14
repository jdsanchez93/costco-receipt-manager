namespace CostcoReceipts.Api.Configuration;

public class S3Options
{
    public const string SectionName = "S3";

    public string BucketName { get; set; } = string.Empty;
    public int PresignedUrlExpirySeconds { get; set; } = 3600;
}
