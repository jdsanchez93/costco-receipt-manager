namespace CostcoReceipts.Api.Configuration;

public class InternalApiOptions
{
    public const string SectionName = "InternalApi";

    /// <summary>
    /// Shared secret the receipt-processor Lambda presents via the
    /// X-Internal-Api-Key header to authenticate server-to-server calls.
    /// </summary>
    public string SharedSecret { get; set; } = string.Empty;
}
