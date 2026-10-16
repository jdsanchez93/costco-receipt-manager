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
// EF Core (targets the same MySQL as the API)
// ============================================================
var connectionString = cli.ConnectionString
    ?? builder.Configuration.GetConnectionString("MySql")
    ?? throw new InvalidOperationException(
        "Set ConnectionStrings:MySql in appsettings or pass --connection-string <cs>.");

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

builder.Services.AddScoped<PlaceholderContactMerger>();

var app = builder.Build();

// ============================================================
// Run
// ============================================================
using var scope = app.Services.CreateScope();

try
{
    var merger = scope.ServiceProvider.GetRequiredService<PlaceholderContactMerger>();
    await merger.RunAsync(cli.DryRun, CancellationToken.None);
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

    // The merge is still required explicitly rather than being the implicit
    // default. It rewrites contact rows and reassigns memberships, so running
    // the tool with no arguments should print help, not mutate data.
    if (!cli.MergePlaceholdersByName)
    {
        Console.Error.WriteLine("Nothing to do: pass --merge-placeholders-by-name.");
        PrintUsage();
        return null;
    }

    return cli;
}

static void PrintUsage()
{
    Console.WriteLine("""
        Data maintenance for CostcoReceipts.

        Collapses same-owner placeholder contacts whose display names match.
        ReceiptMembersController.AddMember deliberately creates a fresh
        placeholder Contact every time ("two Johns are two Johns"), so
        duplicates accumulate through ordinary use; this is the cleanup for
        that. Touches MySQL only.

        Usage:
          dotnet run --project api/CostcoReceipts.Migration -- --merge-placeholders-by-name [OPTIONS]

        Options:
          --merge-placeholders-by-name  Required. The operation to run.
          --connection-string <cs>      MySQL connection string
                                        (default: appsettings ConnectionStrings:MySql)
          --dry-run                     Report what would happen, don't write anything
          --help, -h                    Show this message
        """);
}

internal sealed class CliOptions
{
    public string? ConnectionString { get; set; }
    public bool DryRun { get; set; }
    public bool MergePlaceholdersByName { get; set; }
}
