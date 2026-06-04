namespace CostcoReceipts.Api.Configuration;

public class FrontendOptions
{
    public const string SectionName = "Frontend";

    /// <summary>
    /// Base URL of the frontend, used to build share links.
    /// </summary>
    public string BaseUrl { get; set; } = string.Empty;
}
