using Microsoft.AspNetCore.Mvc;
using CostcoReceipts.Api.Models;

namespace CostcoReceipts.Api.Controllers;

[ApiController]
[Route("api")]
public class HealthController : ControllerBase
{
    [HttpGet("health")]
    public IActionResult GetHealth()
    {
        var response = new HealthResponse
        {
            Status = "healthy",
            Timestamp = DateTime.UtcNow,
            Environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Unknown"
        };

        return Ok(response);
    }
}