namespace CostcoReceipts.Api.Configuration;

public class DynamoDbConfiguration
{
    private readonly IConfiguration _configuration;
    
    public DynamoDbConfiguration(IConfiguration configuration)
    {
        _configuration = configuration;
    }
    
    public string MainTableName => _configuration["DYNAMODB_TABLE_MAIN"]
        ?? throw new InvalidOperationException(
            "DYNAMODB_TABLE_MAIN configuration is required but not found. " +
            "Set it via environment variable, user secrets, or appsettings.json");

    public static class GSI
    {
        public const string GSI1 = "GSI1";  // For user-based queries
        public const string GSI2 = "GSI2";  // For receipt share lookups
    }

    public static class EntityTypes
    {
        public const string ReceiptItem = "RECEIPT_ITEM";
        public const string ReceiptMember = "RECEIPT_MEMBER";
        public const string ReceiptShare = "RECEIPT_SHARE";
        public const string ReceiptGeometry = "RECEIPT_GEOMETRY";
        public const string PlaceholderUser = "PLACEHOLDER_USER";
    }

    public static class KeyPrefixes
    {
        public const string Receipt = "RECEIPT#";
        public const string User = "USER#";
        public const string Item = "ITEM#";
        public const string Share = "SHARE#";
        public const string Geometry = "GEOMETRY#";
    }
}