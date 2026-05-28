using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CostcoReceipts.Api.Models;
using CostcoReceipts.Api.Services;
using CostcoReceipts.Api.Configuration;
using System.Security.Claims;
using System.Text.Json;

namespace CostcoReceipts.Api.Controllers;

[ApiController]
[Route("api/receipts")]
public class ReceiptsController : ControllerBase
{
    private readonly ISingleTableService _singleTableService;
    private readonly ILogger<ReceiptsController> _logger;
    private readonly HttpClient _httpClient;
    private readonly AppConfiguration _appConfig;

    public ReceiptsController(
        ISingleTableService singleTableService, 
        ILogger<ReceiptsController> logger,
        HttpClient httpClient,
        AppConfiguration appConfig)
    {
        _singleTableService = singleTableService;
        _logger = logger;
        _httpClient = httpClient;
        _appConfig = appConfig;
    }

    private string? GetUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
    }

    private string? GetAuthToken()
    {
        var authHeader = HttpContext.Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader?.StartsWith("Bearer ") == true)
        {
            return authHeader.Substring(7);
        }
        return null;
    }

    // ==================== UPLOAD/DOWNLOAD URLS ====================

    [HttpPost("get-upload-url")]
    [Authorize]
    public async Task<IActionResult> GetUploadUrl([FromBody] GetUploadUrlRequest? request)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var token = GetAuthToken();
            if (string.IsNullOrEmpty(token))
            {
                return Unauthorized(new { error = "Invalid authorization header" });
            }

            var contentType = request?.ContentType ?? "image/jpeg";

            // Call external S3 upload API
            var uploadApiUrl = _appConfig.S3UploadApiUrl;
            if (string.IsNullOrEmpty(uploadApiUrl))
            {
                return StatusCode(500, new { error = "S3 upload API URL not configured" });
            }

            var requestBody = new { content_type = contentType };
            var requestJson = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(requestJson, System.Text.Encoding.UTF8, "application/json");

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

            var response = await _httpClient.PostAsync(uploadApiUrl, content);
            var responseJson = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("S3 upload API error: {StatusCode} - {Response}", response.StatusCode, responseJson);
                return StatusCode(500, new { error = "Failed to get upload URL" });
            }

            var s3Response = JsonSerializer.Deserialize<JsonElement>(responseJson);

            return Ok(new GetUploadUrlResponse
            {
                ReceiptId = s3Response.GetProperty("receipt_id").GetString() ?? "",
                UploadUrl = s3Response.GetProperty("upload_url").GetString() ?? "",
                ExpiresIn = s3Response.GetProperty("expires_in").GetInt32()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting upload URL");
            return StatusCode(500, new { error = "Failed to get upload URL" });
        }
    }

    [HttpGet("get-download-url/{receiptId}")]
    [Authorize]
    public async Task<IActionResult> GetDownloadUrl(string receiptId)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            if (string.IsNullOrEmpty(receiptId))
            {
                return BadRequest(new { error = "Receipt ID is required" });
            }

            // Verify user is a member of this receipt
            var receiptMembers = await _singleTableService.GetUserReceiptsAsync(userId);
            var membership = receiptMembers.FirstOrDefault(r => r.ReceiptId == receiptId);

            if (membership == null)
            {
                return NotFound(new { error = "Receipt not found or access denied" });
            }

            var token = GetAuthToken();
            if (string.IsNullOrEmpty(token))
            {
                return Unauthorized(new { error = "Invalid authorization header" });
            }

            // Call external S3 download API
            var downloadApiUrl = _appConfig.S3DownloadApiUrl;
            if (string.IsNullOrEmpty(downloadApiUrl))
            {
                return StatusCode(500, new { error = "S3 download API URL not configured" });
            }

            var fullUrl = $"{downloadApiUrl}/{receiptId}";

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

            var response = await _httpClient.GetAsync(fullUrl);
            var responseJson = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("S3 download API error: {StatusCode} - {Response}", response.StatusCode, responseJson);
                return StatusCode(500, new { error = "Failed to get download URL" });
            }

            var s3Response = JsonSerializer.Deserialize<JsonElement>(responseJson);

            return Ok(new GetDownloadUrlResponse
            {
                DownloadUrl = s3Response.GetProperty("download_url").GetString() ?? "",
                ExpiresIn = s3Response.GetProperty("expires_in").GetInt32()
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting download URL for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to get download URL" });
        }
    }

    // ==================== USER RECEIPTS ====================

    [HttpGet("user-receipts")]
    [Authorize]
    public async Task<IActionResult> GetUserReceipts()
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var receiptMembers = await _singleTableService.GetUserReceiptsAsync(userId);
            return Ok(receiptMembers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching receipts for user {UserId}", GetUserId());
            return StatusCode(500, new { error = "Failed to fetch receipts" });
        }
    }

    // ==================== RECEIPT DATA ====================

    [HttpGet("receipt/{receiptId}/items")]
    [Authorize(Policy = "ReceiptMember")]
    public async Task<IActionResult> GetReceiptItems(string receiptId)
    {
        try
        {
            var items = await _singleTableService.GetReceiptItemsAsync(receiptId);
            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching receipt items for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to fetch receipt items" });
        }
    }

    [HttpGet("receipt/{receiptId}/geometry")]
    [Authorize(Policy = "ReceiptMember")]
    public async Task<IActionResult> GetReceiptGeometry(string receiptId)
    {
        try
        {
            // Authorization handler already verified membership
            var geometryData = await _singleTableService.GetReceiptGeometryAsync(receiptId);
            return Ok(geometryData);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching receipt geometry for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to fetch receipt geometry" });
        }
    }

    [HttpPost("validate/{receiptId}")]
    [Authorize(Policy = "ReceiptEditor")]
    public async Task<IActionResult> ValidateReceipt(string receiptId, [FromBody] ValidateReceiptRequest request)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var validationStatus = request.IsValid ? "confirmed" : "disputed";
            
            await _singleTableService.ValidateReceiptSubtotalAsync(
                receiptId, 
                userId, 
                validationStatus, 
                request.Comments);

            return Ok(new
            {
                message = "Validation updated successfully",
                validationStatus
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating validation for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to update validation" });
        }
    }

    // ==================== RECEIPT MEMBERS ====================

    [HttpGet("receipt/{receiptId}/members")]
    [Authorize(Policy = "ReceiptMember")]
    public async Task<IActionResult> GetReceiptMembers(string receiptId)
    {
        try
        {
            // Authorization handler already verified membership
            var members = await _singleTableService.GetReceiptMembersAsync(receiptId);
            return Ok(members);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching receipt members for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to fetch receipt members" });
        }
    }

    [HttpPost("receipt/{receiptId}/members")]
    [Authorize(Policy = "ReceiptOwner")]
    public async Task<IActionResult> AddReceiptMember(string receiptId, [FromBody] AddReceiptMemberRequest request)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            if (string.IsNullOrEmpty(request.DisplayName))
            {
                return BadRequest(new { error = "Display name is required" });
            }

            if (!new[] { "authenticated", "placeholder" }.Contains(request.UserType))
            {
                return BadRequest(new { error = "Valid user type is required (authenticated or placeholder)" });
            }

            // Authorization handler already verified ownership
            ReceiptMember member;
            var role = request.Role ?? ReceiptRoles.Editor;  // Default new members to editor

            if (!ReceiptRoles.IsValid(role))
            {
                return BadRequest(new { error = "Invalid role. Must be owner, editor, or viewer" });
            }

            if (request.UserType == "authenticated")
            {
                if (string.IsNullOrEmpty(request.Email))
                {
                    return BadRequest(new { error = "Email is required for authenticated users" });
                }

                member = await _singleTableService.CreateReceiptMemberAsync(
                    receiptId,
                    request.Email,
                    request.DisplayName,
                    request.Email,
                    userId,
                    "authenticated",
                    role);
            }
            else
            {
                var placeholderUserId = Guid.NewGuid().ToString();
                member = await _singleTableService.CreateReceiptMemberAsync(
                    receiptId,
                    placeholderUserId,
                    request.DisplayName,
                    null,
                    userId,
                    "placeholder",
                    role);
            }

            return CreatedAtAction(nameof(GetReceiptMembers), new { receiptId }, new
            {
                message = "Member added successfully",
                member
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding receipt member to receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to add receipt member" });
        }
    }

    [HttpPut("receipt/{receiptId}/members/{memberId}/role")]
    [Authorize(Policy = "ReceiptOwner")]
    public async Task<IActionResult> UpdateMemberRole(string receiptId, string memberId, [FromBody] UpdateMemberRoleRequest request)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            if (string.IsNullOrEmpty(request.Role) || !ReceiptRoles.IsValid(request.Role))
            {
                return BadRequest(new { error = "Invalid role. Must be owner, editor, or viewer" });
            }

            // Prevent owner from changing their own role
            if (memberId == userId && request.Role != ReceiptRoles.Owner)
            {
                return BadRequest(new { error = "Cannot change your own role. Transfer ownership first." });
            }

            await _singleTableService.UpdateMemberRoleAsync(receiptId, memberId, request.Role);

            return Ok(new
            {
                message = "Member role updated successfully",
                receiptId,
                memberId,
                role = request.Role
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Member not found" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating member role for receipt {ReceiptId}, member {MemberId}", receiptId, memberId);
            return StatusCode(500, new { error = "Failed to update member role" });
        }
    }

    [HttpDelete("receipt/{receiptId}/members/{memberId}")]
    [Authorize(Policy = "ReceiptOwner")]
    public async Task<IActionResult> RemoveReceiptMember(string receiptId, string memberId)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            // Prevent owner from removing themselves
            if (memberId == userId)
            {
                return BadRequest(new { error = "Cannot remove yourself from the receipt. Transfer ownership or delete the receipt." });
            }

            await _singleTableService.RemoveReceiptMemberAsync(receiptId, memberId);

            return Ok(new
            {
                message = "Member removed successfully",
                receiptId,
                memberId
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Member not found" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing member {MemberId} from receipt {ReceiptId}", memberId, receiptId);
            return StatusCode(500, new { error = "Failed to remove member" });
        }
    }

    [HttpPut("receipt/{receiptId}/members/update-details")]
    [Authorize(Policy = "ReceiptMember")]
    public async Task<IActionResult> UpdateMemberDetails(string receiptId, [FromBody] UpdateMemberDetailsRequest request)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            if (string.IsNullOrEmpty(request.Email))
            {
                return BadRequest(new { error = "Email is required" });
            }

            // Authorization handler verified membership, only update own details
            var displayName = request.Name ?? request.Email.Split('@')[0];
            await _singleTableService.UpdateMemberDetailsAsync(receiptId, userId, displayName, request.Email);

            return Ok(new
            {
                message = "Member details updated successfully",
                receiptId,
                userId,
                displayName,
                email = request.Email
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating member details for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to update member details" });
        }
    }

    // ==================== RECEIPT SHARING ====================

    [HttpPost("receipt/{receiptId}/share")]
    [Authorize(Policy = "ReceiptEditor")]
    public async Task<IActionResult> CreateReceiptShare(string receiptId, [FromBody] CreateReceiptShareRequest? request)
    {
        try
        {
            var userId = GetUserId();
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            // Authorization handler already verified membership and role
            var expiresInDays = request?.ExpiresInDays ?? 30;
            var share = await _singleTableService.CreateReceiptShareAsync(receiptId, userId, expiresInDays);

            var cloudFrontDomain = _appConfig.CloudFrontDomain;
            var frontendUrl = !string.IsNullOrEmpty(cloudFrontDomain)
                ? $"https://{cloudFrontDomain}"
                : "http://localhost:3000";

            return CreatedAtAction(nameof(GetReceiptShares), new { receiptId }, new
            {
                message = "Share link created successfully",
                shareToken = share.ShareToken,
                shareUrl = $"{frontendUrl}/shared-receipt/{share.ShareToken}",
                expiresAt = DateTimeOffset.FromUnixTimeSeconds(share.ExpiresAt).ToString("O")
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating receipt share for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to create receipt share" });
        }
    }

    [HttpGet("receipt/{receiptId}/shares")]
    [Authorize(Policy = "ReceiptOwner")]
    public async Task<IActionResult> GetReceiptShares(string receiptId)
    {
        try
        {
            // Authorization handler already verified ownership
            var shares = await _singleTableService.GetReceiptSharesAsync(receiptId);

            var cloudFrontDomain = _appConfig.CloudFrontDomain;
            var frontendUrl = !string.IsNullOrEmpty(cloudFrontDomain)
                ? $"https://{cloudFrontDomain}"
                : "http://localhost:3000";

            // Set computed properties for API response
            foreach (var share in shares)
            {
                share.ShareUrl = $"{frontendUrl}/shared-receipt/{share.ShareToken}";
                share.ExpiresAtIso = DateTimeOffset.FromUnixTimeSeconds(share.ExpiresAt).ToString("O");
            }

            return Ok(shares);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching receipt shares for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to fetch receipt shares" });
        }
    }

    [HttpDelete("receipt/{receiptId}/shares/{shareToken}")]
    [Authorize(Policy = "ReceiptOwner")]
    public async Task<IActionResult> DeactivateShare(string receiptId, string shareToken)
    {
        try
        {
            // Authorization handler already verified ownership
            await _singleTableService.DeactivateShareAsync(receiptId, shareToken);

            return Ok(new
            {
                message = "Share link deactivated successfully",
                receiptId,
                shareToken
            });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "Share not found" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deactivating share {ShareToken} for receipt {ReceiptId}", shareToken, receiptId);
            return StatusCode(500, new { error = "Failed to deactivate share" });
        }
    }

    // ==================== ITEM ASSIGNMENTS ====================

    [HttpPut("receipt/{receiptId}/items/{itemId}/assignment")]
    [Authorize(Policy = "ReceiptEditor")]
    public async Task<IActionResult> UpdateItemAssignment(string receiptId, string itemId, [FromBody] UpdateItemAssignmentRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(itemId))
            {
                return BadRequest(new { error = "Item ID is required" });
            }

            // Authorization handler already verified membership and role
            await _singleTableService.UpdateItemAssignmentAsync(receiptId, itemId, request.AssignedUsers);

            return Ok(new
            {
                message = "Item assignment updated successfully",
                receiptId,
                itemId,
                assignedUsers = request.AssignedUsers
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating item assignment for receipt {ReceiptId}, item {ItemId}", receiptId, itemId);
            return StatusCode(500, new { error = "Failed to update item assignment" });
        }
    }

    [HttpPut("receipt/{receiptId}/items/assignments/bulk")]
    [Authorize(Policy = "ReceiptEditor")]
    public async Task<IActionResult> BulkUpdateItemAssignments(string receiptId, [FromBody] BulkUpdateItemAssignmentsRequest request)
    {
        try
        {
            // Authorization handler already verified membership and role
            var updates = request.Updates.Select(u => (u.ItemId, u.AssignedUsers)).ToList();
            await _singleTableService.BulkUpdateItemAssignmentsAsync(receiptId, updates);

            return Ok(new
            {
                message = "Bulk assignment update completed",
                receiptId,
                updateCount = updates.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error with bulk assignment update for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to update assignments" });
        }
    }

    [HttpDelete("receipt/{receiptId}/items/assignments/all")]
    [Authorize(Policy = "ReceiptEditor")]
    public async Task<IActionResult> ClearAllItemAssignments(string receiptId)
    {
        try
        {
            // Authorization handler already verified membership and role
            await _singleTableService.ClearAllItemAssignmentsAsync(receiptId);

            return Ok(new
            {
                message = "All assignments cleared successfully",
                receiptId
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error clearing all assignments for receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to clear assignments" });
        }
    }

    // ==================== RECEIPT DELETE ====================

    [HttpDelete("receipt/{receiptId}")]
    [Authorize(Policy = "ReceiptOwner")]
    public async Task<IActionResult> DeleteReceipt(string receiptId)
    {
        try
        {
            // Authorization handler already verified ownership
            await _singleTableService.DeleteReceiptAsync(receiptId);

            return Ok(new
            {
                message = "Receipt and all associated data deleted successfully",
                receiptId
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting receipt {ReceiptId}", receiptId);
            return StatusCode(500, new { error = "Failed to delete receipt" });
        }
    }
}