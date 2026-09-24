using Amazon.S3;
using Amazon.S3.Model;
using CostcoReceipts.Api.Authorization;
using CostcoReceipts.Api.Configuration;
using CostcoReceipts.Api.Data;
using CostcoReceipts.Api.Data.Entities;
using CostcoReceipts.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CostcoReceipts.Api.Controllers;

/// <summary>
/// Receipt-level operations: upload/download URL generation, the user's receipt
/// list, geometry (including the computed subtotal-match check), and deletion.
/// Item / member / share endpoints live in their own resource controllers.
/// </summary>
[ApiController]
[Route("api/receipts")]
public class ReceiptsController : ControllerBase
{
    // Only formats Textract's DetectDocumentText can read — anything else
    // uploads fine but fails OCR in the receipt processor Lambda.
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/jpg", "image/png",
    };

    private readonly AppDbContext _db;
    private readonly IAmazonS3 _s3Client;
    private readonly IOptions<S3Options> _s3;
    private readonly ILogger<ReceiptsController> _logger;

    public ReceiptsController(
        AppDbContext db,
        IAmazonS3 s3Client,
        IOptions<S3Options> s3,
        ILogger<ReceiptsController> logger)
    {
        _db = db;
        _s3Client = s3Client;
        _s3 = s3;
        _logger = logger;
    }

    // ============================================================
    // Upload / Download URL generation
    // ============================================================

    [HttpPost("get-upload-url")]
    [Authorize]
    public async Task<IActionResult> GetUploadUrl(
        [FromBody] GetUploadUrlRequest? request,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized(new { error = "Invalid authorization header" });

        var bucket = _s3.Value.BucketName;
        if (string.IsNullOrEmpty(bucket))
        {
            _logger.LogError("S3:BucketName is not configured");
            return Problem("S3 bucket not configured", statusCode: StatusCodes.Status500InternalServerError);
        }

        var contentType = request?.ContentType ?? "image/jpeg";
        if (!AllowedContentTypes.Contains(contentType))
        {
            return BadRequest(new { error = $"Unsupported content type: {contentType}" });
        }

        // Seed the MySQL side of ownership up front, so the receipt is
        // immediately viewable/downloadable by its owner rather than waiting
        // on the (not-yet-built) Textract-to-MySQL bridge. UserProvisioningMiddleware
        // guarantees a self-contact for the caller before this action runs.
        var selfContactId = await _db.Contacts
            .Where(c => c.OwnerUserId == userId && c.UserId == userId)
            .Select(c => c.ContactId)
            .FirstOrDefaultAsync(ct);

        if (selfContactId == default)
        {
            _logger.LogError("No self-contact found for user {UserId}; user provisioning may have failed", userId);
            return Problem("User is not provisioned", statusCode: StatusCodes.Status500InternalServerError);
        }

        var receiptId = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;

        _db.Receipts.Add(new Receipt
        {
            ReceiptId = receiptId,
            OwnerUserId = userId,
            CreatedAt = now,
            ProcessingStatus = ReceiptProcessingStatus.Pending,
        });
        _db.ReceiptMembers.Add(new ReceiptMember
        {
            ReceiptId = receiptId,
            ContactId = selfContactId,
            Role = ReceiptRoles.Owner,
            AddedByMemberId = null,
            AddedAt = now,
        });
        await _db.SaveChangesAsync(ct);

        var expiresIn = _s3.Value.PresignedUrlExpirySeconds;
        var uploadUrl = await _s3Client.GetPreSignedURLAsync(new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            Key = ImageKey(userId, receiptId),
            Verb = HttpVerb.PUT,
            Expires = now.AddSeconds(expiresIn),
            ContentType = contentType,
        });

        return Ok(new GetUploadUrlResponse
        {
            ReceiptId = receiptId,
            UploadUrl = uploadUrl,
            ExpiresIn = expiresIn,
        });
    }

    [HttpGet("get-download-url/{receiptId}")]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetDownloadUrl(string receiptId, CancellationToken ct)
    {
        var bucket = _s3.Value.BucketName;
        if (string.IsNullOrEmpty(bucket))
        {
            _logger.LogError("S3:BucketName is not configured");
            return Problem("S3 bucket not configured", statusCode: StatusCodes.Status500InternalServerError);
        }

        var receipt = await _db.Receipts.FindAsync([receiptId], ct);
        if (receipt is null) return NotFound(new { error = "Receipt not found" });

        var expiresIn = _s3.Value.PresignedUrlExpirySeconds;
        var downloadUrl = await _s3Client.GetPreSignedURLAsync(new GetPreSignedUrlRequest
        {
            BucketName = bucket,
            // Keyed by the receipt's owner, not the requesting caller — a
            // shared receipt's non-owner members must still resolve to the
            // actual uploader's S3 path.
            Key = ImageKey(receipt.OwnerUserId, receiptId),
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddSeconds(expiresIn),
        });

        return Ok(new GetDownloadUrlResponse
        {
            DownloadUrl = downloadUrl,
            ExpiresIn = expiresIn,
        });
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

    [HttpGet("receipt/{receiptId}")]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetReceipt(string receiptId, CancellationToken ct)
    {
        var receipt = await _db.Receipts.AsNoTracking().FirstOrDefaultAsync(r => r.ReceiptId == receiptId, ct);
        if (receipt is null) return NotFound(new { error = "Receipt not found" });

        return Ok(ReceiptSummaryDto.From(receipt));
    }

    [HttpGet("receipt/{receiptId}/geometry")]
    [Authorize(Policy = ReceiptPolicies.Member)]
    public async Task<IActionResult> GetGeometry(string receiptId, CancellationToken ct)
    {
        var rows = await _db.ReceiptGeometries
            .AsNoTracking()
            .Where(g => g.ReceiptId == receiptId)
            .ToListAsync(ct);

        var items = await _db.ReceiptItems
            .AsNoTracking()
            .Where(i => i.ReceiptId == receiptId)
            .Select(i => new ReceiptItemDto { Price = i.Price, Discount = i.Discount })
            .ToListAsync(ct);

        return Ok(GeometryDto.From(rows, ReceiptCalculations.Sum(items)));
    }

    [HttpDelete("receipt/{receiptId}")]
    [Authorize(Policy = ReceiptPolicies.Owner)]
    public async Task<IActionResult> DeleteReceipt(string receiptId, CancellationToken ct)
    {
        var receipt = await _db.Receipts.FindAsync([receiptId], ct);
        if (receipt is null) return NotFound(new { error = "Receipt not found" });

        _db.Receipts.Remove(receipt);
        await _db.SaveChangesAsync(ct);

        // The row is the source of truth and it's gone, so the delete has
        // succeeded; removing the image is best-effort cleanup. A failure
        // leaves an orphaned object rather than failing a request whose
        // effect already happened. Versioning is on, so this only writes a
        // delete marker. CancellationToken.None so a client disconnecting
        // after the commit doesn't abandon the cleanup.
        try
        {
            await _s3Client.DeleteObjectAsync(new DeleteObjectRequest
            {
                BucketName = _s3.Value.BucketName,
                Key = ImageKey(receipt.OwnerUserId, receiptId),
            }, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Deleted receipt {ReceiptId} but could not delete its image", receiptId);
        }

        return NoContent();
    }

    /// <summary>
    /// S3 key of a receipt's image. Keyed by the receipt's owner, not the
    /// caller — upload, download and delete must all resolve to the same path.
    /// </summary>
    private static string ImageKey(string ownerUserId, string receiptId) =>
        $"uploads/{ownerUserId}/{receiptId}.jpg";
}
