namespace CostcoReceipts.Api.Configuration;

public class S3Options
{
    public const string SectionName = "S3";

    public string UploadApiUrl { get; set; } = string.Empty;
    public string DownloadApiUrl { get; set; } = string.Empty;
}
