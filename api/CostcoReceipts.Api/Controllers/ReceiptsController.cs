using System.Net.Http.Headers;
using System.Net.Http.Json;
using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Configuration;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// Receipt-level operations: upload/download URL passthrough, the user's receipt
/// list, validation, geometry, and deletion.
/// Item / member / share endpoints live in their own resource controllers.
/// </summary>
[ApiController]
[Route("api/receipts")]
public class ReceiptsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IOptions<S3Options> _s3;
    private readonly ILogger<ReceiptsController> _logger;

    public ReceiptsController(
        AppDbContext db,
        IHttpClientFactory httpFactory,
        IOptions<S3Options> s3,
        ILogger<ReceiptsController> logger)
    {
        _db = db;
        _httpFactory = httpFactory;
        _s3 = s3;
        _logger = logger;
    }

    // ============================================================
    // Upload / Download URL passthrough
    // ============================================================

    // TODO(upload-pipeline): passthrough to the external Textract Lambda; the
    // receipt row it produces still lands in DynamoDB. Replace with native
    // logic when the upload/OCR/persistence stack moves into this repo.
    [HttpPost("get-upload-url")]
    [Authorize]
    public async Task<IActionResult> GetUploadUrl(
        [FromBody] GetUploadUrlRequest? request,
        CancellationToken ct)
    {
        var token = Request.GetBearerToken();
        if (token is null) return Unauthorized(new { error = "Invalid authorization header" });

        var url = _s3.Value.UploadApiUrl;
        if (string.IsNullOrEmpty(url))
        {
            _logger.LogError("S3:UploadApiUrl is not configured");
            return Problem("S3 upload API URL not configured", statusCode: StatusCodes.Status500InternalServerError);
        }

        var contentType = request?.ContentType ?? "image/jpeg";
        var payload = await ForwardJsonAsync(
            HttpMethod.Post, url, token, new { content_type = contentType }, ct);

        if (payload is null) return Problem("Failed to get upload URL", statusCode: StatusCodes.Status502BadGateway);

        return Ok(new GetUploadUrlResponse
        {
            ReceiptId = payload.Value.GetProperty("receipt_id").GetString() ?? "",
            UploadUrl = payload.Value.GetProperty("upload_url").GetString() ?? "",
            ExpiresIn = payload.Value.GetProperty("expires_in").GetInt32(),
        });
    }

    [HttpGet("get-download-url/{receiptId}")]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetDownloadUrl(string receiptId, CancellationToken ct)
    {
        var token = Request.GetBearerToken();
        if (token is null) return Unauthorized(new { error = "Invalid authorization header" });

        var baseUrl = _s3.Value.DownloadApiUrl;
        if (string.IsNullOrEmpty(baseUrl))
        {
            _logger.LogError("S3:DownloadApiUrl is not configured");
            return Problem("S3 download API URL not configured", statusCode: StatusCodes.Status500InternalServerError);
        }

        var payload = await ForwardJsonAsync(HttpMethod.Get, $"{baseUrl}/{receiptId}", token, body: null, ct);
        if (payload is null) return Problem("Failed to get download URL", statusCode: StatusCodes.Status502BadGateway);

        return Ok(new GetDownloadUrlResponse
        {
            DownloadUrl = payload.Value.GetProperty("download_url").GetString() ?? "",
            ExpiresIn = payload.Value.GetProperty("expires_in").GetInt32(),
        });
    }

    private async Task<System.Text.Json.JsonElement?> ForwardJsonAsync(
        HttpMethod method,
        string url,
        string bearerToken,
        object? body,
        CancellationToken ct)
    {
        var http = _httpFactory.CreateClient();
        using var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        if (body is not null) req.Content = JsonContent.Create(body);

        using var resp = await http.SendAsync(req, ct);
        var raw = await resp.Content.ReadAsStringAsync(ct);

        if (!resp.IsSuccessStatusCode)
        {
            _logger.LogError("Upstream {Method} {Url} returned {Status}: {Body}",
                method, url, (int)resp.StatusCode, raw);
            return null;
        }

        return System.Text.Json.JsonDocument.Parse(raw).RootElement.Clone();
    }

    // ============================================================
    // User's receipts (chains: users -> contacts -> receipt_members -> receipts)
    // ============================================================

    [HttpGet("user-receipts")]
    [Authorize]
    public async Task<IActionResult> GetUserReceipts(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var memberships = await _db.ReceiptMembers
            .AsNoTracking()
            .Include(m => m.Contact)
            .Where(m => m.Contact.UserId == userId)
            .OrderByDescending(m => m.AddedAt)
            .Select(m => ReceiptMemberDto.From(m))
            .ToListAsync(ct);

        return Ok(memberships);
    }

    // ============================================================
    // Per-receipt scalar operations
    // ============================================================

    [HttpGet("receipt/{receiptId}/geometry")]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetGeometry(string receiptId, CancellationToken ct)
    {
        var rows = await _db.ReceiptGeometries
            .AsNoTracking()
            .Where(g => g.ReceiptId == receiptId)
            .ToListAsync(ct);

        return Ok(GeometryDto.From(rows));
    }

    [HttpPost("validate/{receiptId}")]
    [Authorize(Policy = ReceiptPolicies.Editor)]
    public async Task<IActionResult> ValidateReceipt(
        string receiptId,
        [FromBody] ValidateReceiptRequest request,
        CancellationToken ct)
    {
        var userId = User.GetUserId()!; // policy guarantees membership

        var member = await _db.ReceiptMembers
            .Include(m => m.Contact)
            .FirstOrDefaultAsync(m => m.ReceiptId == receiptId && m.Contact.UserId == userId, ct);

        if (member is null) return NotFound(new { error = "Member record not found" });

        var status = request.IsValid ? "confirmed" : "disputed";
        member.ValidationStatus = status;
        member.ValidatedAt = DateTime.UtcNow;
        member.Comments = request.Comments;
        member.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            message = "Validation updated successfully",
            validationStatus = status,
        });
    }

    [HttpDelete("receipt/{receiptId}")]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> DeleteReceipt(string receiptId, CancellationToken ct)
    {
        var receipt = await _db.Receipts.FindAsync([receiptId], ct);
        if (receipt is null) return NotFound(new { error = "Receipt not found" });

        _db.Receipts.Remove(receipt);
        await _db.SaveChangesAsync(ct);

        // TODO(upload-pipeline): once we own image storage, delete the S3 object here.
        return NoContent();
    }
}
