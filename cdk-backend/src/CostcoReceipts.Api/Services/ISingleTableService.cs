using CostcoReceipts.Api.Models;

namespace CostcoReceipts.Api.Services;

public interface ISingleTableService
{
    // User Receipts Methods
    Task<List<ReceiptMember>> GetUserReceiptsAsync(string userId);

    // Receipt Items Methods
    Task<List<ReceiptItem>> GetReceiptItemsAsync(string receiptId);
    Task<ReceiptItem> CreateReceiptItemAsync(string receiptId, ReceiptItem item);

    // Receipt Members Methods
    Task<List<ReceiptMember>> GetReceiptMembersAsync(string receiptId);
    Task<ReceiptMember?> GetUserReceiptMembershipAsync(string userId, string receiptId);
    Task<ReceiptMember> CreateReceiptMemberAsync(string receiptId, string userId, string displayName,
        string? email, string addedByUserId, string userType = "authenticated", string role = ReceiptRoles.Editor);
    Task UpdateMemberDetailsAsync(string receiptId, string userId, string displayName, string email);
    Task UpdateMemberRoleAsync(string receiptId, string userId, string newRole);
    Task RemoveReceiptMemberAsync(string receiptId, string userId);

    // Item Assignment Methods
    Task UpdateItemAssignmentAsync(string receiptId, string itemId, List<string> assignedUsers);
    Task BulkUpdateItemAssignmentsAsync(string receiptId, List<(string ItemId, List<string> AssignedUsers)> updates);
    Task ClearAllItemAssignmentsAsync(string receiptId);

    // Receipt Validation Methods
    Task ValidateReceiptSubtotalAsync(string receiptId, string userId, string validationStatus, 
        string? comments);

    // Receipt Sharing Methods
    Task<ReceiptShare> CreateReceiptShareAsync(string receiptId, string userId, int expiresInDays = 30);
    Task<List<ReceiptShare>> GetReceiptSharesAsync(string receiptId);
    Task<ReceiptShare?> GetSharedReceiptAsync(string shareToken);
    Task DeactivateShareAsync(string receiptId, string shareToken);

    // Receipt Delete Methods
    Task DeleteReceiptAsync(string receiptId);

    // Receipt Geometry Methods
    Task<Dictionary<string, object>> GetReceiptGeometryAsync(string receiptId);
    Task StoreReceiptGeometryAsync(string receiptId, List<ReceiptGeometry> geometryData);
}