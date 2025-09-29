using Microsoft.AspNetCore.Mvc;
using CostcoReceipts.Api.Models;
using CostcoReceipts.Api.Services;

namespace CostcoReceipts.Api.Controllers;

[ApiController]
[Route("api/receipts")]
public class SharedController : ControllerBase
{
    private readonly ISingleTableService _singleTableService;
    private readonly ILogger<SharedController> _logger;

    public SharedController(ISingleTableService singleTableService, ILogger<SharedController> logger)
    {
        _singleTableService = singleTableService;
        _logger = logger;
    }

    // Public sharing route (no auth required)
    [HttpGet("shared/{shareToken}")]
    public async Task<IActionResult> GetSharedReceipt(string shareToken)
    {
        try
        {
            if (string.IsNullOrEmpty(shareToken))
            {
                return BadRequest(new { error = "Share token is required" });
            }

            var share = await _singleTableService.GetSharedReceiptAsync(shareToken);

            if (share == null)
            {
                return NotFound(new { error = "Invalid or expired share link" });
            }

            // Get receipt data
            var receiptId = share.ReceiptId;
            
            var itemsTask = _singleTableService.GetReceiptItemsAsync(receiptId);
            var membersTask = _singleTableService.GetReceiptMembersAsync(receiptId);
            var geometryTask = _singleTableService.GetReceiptGeometryAsync(receiptId);

            await Task.WhenAll(itemsTask, membersTask, geometryTask);

            var items = await itemsTask;
            var members = await membersTask;
            var geometry = await geometryTask;

            var response = new SharedReceiptResponse
            {
                ReceiptId = receiptId,
                Items = items,
                Members = members,
                Geometry = geometry,
                ShareInfo = new ShareInfo
                {
                    CreatedAt = share.CreatedAt,
                    ExpiresAt = DateTimeOffset.FromUnixTimeSeconds(share.ExpiresAt).ToString("O")
                }
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching shared receipt for token {ShareToken}", shareToken);
            return StatusCode(500, new { error = "Failed to fetch shared receipt" });
        }
    }
}