using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CostcoReceipts.Api.Data;

/// <summary>
/// Unhealthy when the database can't be reached with the configured
/// connection string. The API otherwise starts fine with a broken one, because
/// nothing touches the database until the first request.
///
/// Resolves <see cref="AppDbContext"/> inside the check rather than taking it
/// as a constructor dependency. Building the context runs the server-version
/// detection in Program.cs until that first succeeds, and it throws while the
/// database is down. The health check service turns only exceptions from the
/// check itself into an Unhealthy result: it constructs the check outside its
/// try, so one thrown there is a 500. That is exactly the case a deploy
/// probes, a fresh container whose detection hasn't run yet.
///
/// Hand-written rather than <c>AddDbContextCheck</c> from
/// Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore, whose
/// check takes the context as a constructor dependency.
/// </summary>
public class DatabaseHealthCheck : IHealthCheck
{
    private readonly IServiceProvider _services;

    public DatabaseHealthCheck(IServiceProvider services)
    {
        _services = services;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var db = _services.GetRequiredService<AppDbContext>();
            return await db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("Cannot connect to the database.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Cannot connect to the database.", ex);
        }
    }
}
