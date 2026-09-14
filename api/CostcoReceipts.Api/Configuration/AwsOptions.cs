namespace CostcoReceipts.Api.Configuration;

public class AwsOptions
{
    public const string SectionName = "AWS";

    /// <summary>
    /// Named AWS CLI/SSO profile to use for local development. Leave unset
    /// to fall through to the SDK's default credential provider chain
    /// (e.g. AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars, used in
    /// non-local deployments where there's no IAM role available).
    /// </summary>
    public string? Profile { get; set; }

    public string Region { get; set; } = "us-east-1";
}
