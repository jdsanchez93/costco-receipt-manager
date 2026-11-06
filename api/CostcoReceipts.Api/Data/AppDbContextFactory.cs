using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace CostcoReceipts.Api.Data;

public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddUserSecrets<AppDbContextFactory>(optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("MySql")
            ?? throw new InvalidOperationException(
                "ConnectionStrings:MySql is required for design-time tools.");

        // The dialect, pinned to the Pi's real engine by Database:ServerVersion
        // rather than detected, which would need a live database purely to
        // learn it. Pinning means `dotnet ef` runs with no database at all,
        // and — more importantly — `migrations add` generates against prod's
        // engine by construction instead of against whatever happens to be
        // running locally. See docs/redesign-plan.local.md's "MySQL/MariaDB
        // dialect matters" gotcha.
        //
        // Program.cs reads the same setting, so the app writes SQL for the
        // engine its migrations were generated for.
        var serverVersion = ServerVersion.Parse(
            configuration["Database:ServerVersion"]
                ?? throw new InvalidOperationException(
                    "Database:ServerVersion is required for design-time tools."));

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseMySql(connectionString, serverVersion)
            .Options;

        return new AppDbContext(options);
    }
}
