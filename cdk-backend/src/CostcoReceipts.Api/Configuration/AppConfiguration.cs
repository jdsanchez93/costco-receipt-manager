namespace CostcoReceipts.Api.Configuration;

public static class AppConfiguration
{
    public static string Auth0Domain => Environment.GetEnvironmentVariable("AUTH0_DOMAIN") ?? "";
    public static string Auth0Audience => Environment.GetEnvironmentVariable("AUTH0_AUDIENCE") ?? "";
    public static string S3UploadApiUrl => Environment.GetEnvironmentVariable("S3_UPLOAD_API_URL") ?? "";
    public static string S3DownloadApiUrl => Environment.GetEnvironmentVariable("S3_DOWNLOAD_API_URL") ?? "";
    public static string CloudFrontDomain => Environment.GetEnvironmentVariable("CLOUDFRONT_DOMAIN") ?? "";
    public static string AwsRegion => Environment.GetEnvironmentVariable("AWS_REGION") ?? "us-east-1";
}