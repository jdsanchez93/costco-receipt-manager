using CostcoReceipts.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CostcoReceipts.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;

    public HealthController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Liveness check. Does not require authentication.
    /// </summary>
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            status = "healthy",
            timestamp = DateTime.UtcNow,
            environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"),
        });
    }

    /// <summary>
    /// Readiness check. Verifies the database is reachable.
    /// </summary>
    [HttpGet("ready")]
    public async Task<IActionResult> Ready()
    {
        try
        {
            var canConnect = await _db.Database.CanConnectAsync();
            if (!canConnect)
            {
                return StatusCode(503, new { status = "unhealthy", reason = "database unreachable" });
            }

            return Ok(new { status = "ready" });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { status = "unhealthy", reason = ex.Message });
        }
    }
}
