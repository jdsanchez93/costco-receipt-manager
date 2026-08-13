using Amazon;
using Amazon.DynamoDBv2;
using Amazon.Extensions.NETCore.Setup;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Migration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var cli = ParseArgs(args);
if (cli is null) return 1;

var builder = Host.CreateApplicationBuilder(args);
builder.Logging.AddSimpleConsole(o =>
{
    o.SingleLine = true;
    o.TimestampFormat = "HH:mm:ss ";
});

// ============================================================
// AWS DynamoDB
// ============================================================
var awsOptions = new AWSOptions
{
    Region = RegionEndpoint.GetBySystemName(cli.Region),
};
if (!string.IsNullOrEmpty(cli.Profile))
{
    awsOptions.Profile = cli.Profile;
}
builder.Services.AddDefaultAWSOptions(awsOptions);
builder.Services.AddAWSService<IAmazonDynamoDB>();

// ============================================================
// EF Core (targets the same MySQL as the API)
// ============================================================
var connectionString = cli.ConnectionString
    ?? builder.Configuration.GetConnectionString("MySql")
    ?? throw new InvalidOperationException(
        "Set ConnectionStrings:MySql in appsettings or pass --connection-string <cs>.");

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

builder.Services.AddScoped<Migrator>();
builder.Services.AddScoped<PlaceholderContactMerger>();

var app = builder.Build();

// ============================================================
// Run
// ============================================================
using var scope = app.Services.CreateScope();

try
{
    if (cli.MergePlaceholdersByName)
    {
        var merger = scope.ServiceProvider.GetRequiredService<PlaceholderContactMerger>();
        await merger.RunAsync(cli.DryRun, CancellationToken.None);
    }
    else
    {
        var migrator = scope.ServiceProvider.GetRequiredService<Migrator>();
        await migrator.RunAsync(new MigratorOptions(cli.TableName, cli.DryRun), CancellationToken.None);
    }
    return 0;
}
catch (Exception ex)
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    logger.LogCritical(ex, "Command failed");
    return 2;
}

// ============================================================
// CLI parsing
// ============================================================

static CliOptions? ParseArgs(string[] args)
{
    var cli = new CliOptions();

    for (var i = 0; i < args.Length; i++)
    {
        switch (args[i])
        {
            case "--table" when i + 1 < args.Length:
                cli.TableName = args[++i];
                break;
            case "--profile" when i + 1 < args.Length:
                cli.Profile = args[++i];
                break;
            case "--region" when i + 1 < args.Length:
                cli.Region = args[++i];
                break;
            case "--connection-string" when i + 1 < args.Length:
                cli.ConnectionString = args[++i];
                break;
            case "--dry-run":
                cli.DryRun = true;
                break;
            case "--merge-placeholders-by-name":
                cli.MergePlaceholdersByName = true;
                break;
            case "--help" or "-h":
                PrintUsage();
                return null;
            default:
                Console.Error.WriteLine($"Unknown argument: {args[i]}");
                PrintUsage();
                return null;
        }
    }

    return cli;
}

static void PrintUsage()
{
    Console.WriteLine("""
        Data tools for CostcoReceipts. Runs the DynamoDB -> MySQL migration by
        default; pass --merge-placeholders-by-name to run the placeholder-contact
        merge cleanup instead.

        Usage:
          dotnet run --project api/CostcoReceipts.Migration -- [OPTIONS]

        Migration options (default command):
          --table <name>              DynamoDB table (default: dev-costco-receipt-parser-main)
          --profile <name>            AWS profile (default: uses default credential chain)
          --region <name>             AWS region (default: us-east-1)

        Merge options:
          --merge-placeholders-by-name  Collapse same-owner placeholder contacts
                                        whose display names match (post-migration
                                        cleanup). Ignores DynamoDB entirely.

        Common:
          --connection-string <cs>    MySQL connection string
                                      (default: appsettings ConnectionStrings:MySql)
          --dry-run                   Report what would happen, don't write anything
          --help, -h                  Show this message
        """);
}

internal sealed class CliOptions
{
    public string TableName { get; set; } = "dev-costco-receipt-parser-main";
    public string? Profile { get; set; }
    public string Region { get; set; } = "us-east-1";
    public string? ConnectionString { get; set; }
    public bool DryRun { get; set; }
    public bool MergePlaceholdersByName { get; set; }
}
