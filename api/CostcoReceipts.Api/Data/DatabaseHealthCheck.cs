using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CostcoReceipts.Api.Data;

/// <summary>
/// Unhealthy when the database can't be reached with the configured
/// connection string. The API otherwise starts fine with a broken one, because
/// nothing touches the database until the first request.
///
/// Resolves <see cref="AppDbContext"/> inside the check rather than taking it
/// as a constructor dependency: building the context runs
/// <c>ServerVersion.AutoDetect</c>, which throws when the database is down, and
/// the health check service only turns exceptions from the check itself into
/// an Unhealthy result — one thrown while constructing the check is a 500.
///
/// Hand-written rather than taken from
/// Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore, whose
/// 10.x line depends on EF Core 10; Pomelo holds this project on EF Core 9.
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
