namespace CostcoReceipts.Api.Configuration;

public class AppConfiguration
{
    private readonly IConfiguration _configuration;

    public AppConfiguration(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string Auth0Domain => _configuration["AUTH0_DOMAIN"] ?? "";
    public string Auth0Audience => _configuration["AUTH0_AUDIENCE"] ?? "";
    public string S3UploadApiUrl => _configuration["S3_UPLOAD_API_URL"] ?? "";
    public string S3DownloadApiUrl => _configuration["S3_DOWNLOAD_API_URL"] ?? "";
    public string CloudFrontDomain => _configuration["CLOUDFRONT_DOMAIN"] ?? "";
    public string AwsRegion => _configuration["AWS:Region"] ?? "us-east-1";
    public string AwsProfile => _configuration["AWS:Profile"] ?? "";
}