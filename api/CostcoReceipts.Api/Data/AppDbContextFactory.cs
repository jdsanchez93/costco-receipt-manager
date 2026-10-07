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

        // Design-time dialect, pinned to the Pi's real engine via
        // Database:ServerVersion rather than discovered with AutoDetect.
        //
        // AutoDetect needs a live database purely to learn the dialect, which
        // is why scripts/generate-prod-migration-script.sh spins up a throwaway
        // container. Pinning means `dotnet ef` runs with no database at all,
        // and — more importantly — `migrations add` generates against prod's
        // engine by construction instead of against whatever happens to be
        // running locally. See docs/redesign-plan.local.md's "MySQL/MariaDB
        // dialect matters" gotcha.
        //
        // This is design-time only. Program.cs still uses AutoDetect at
        // runtime, which is correct: the app must match the engine it is
        // actually pointed at, not the one migrations are authored for.
        var pinnedVersion = configuration["Database:ServerVersion"];
        var serverVersion = string.IsNullOrWhiteSpace(pinnedVersion)
            ? ServerVersion.AutoDetect(connectionString)
            : ServerVersion.Parse(pinnedVersion);

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseMySql(connectionString, serverVersion)
            .Options;

        return new AppDbContext(options);
    }
}
