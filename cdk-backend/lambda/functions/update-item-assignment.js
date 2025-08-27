const { SingleTableService } = require('/opt/nodejs/single-table-service');
const { AuthUtils } = require('/opt/nodejs/auth-utils');

const singleTableService = new SingleTableService();
const authUtils = new AuthUtils();

exports.handler = async (event) => {
  return await authUtils.handleRequest(event, async (event, user) => {
    const receiptId = event.pathParameters?.receiptId;
    const itemId = event.pathParameters?.itemId;
    const path = event.path || event.requestContext?.path || '';
    
    if (!receiptId) {
      throw new Error('Receipt ID is required');
    }

    // Verify user has access to this receipt
    const userReceipts = await singleTableService.getUserReceipts(user.userId);
    const hasAccess = userReceipts.some(receipt => receipt.receipt_id === receiptId);
    
    if (!hasAccess) {
      throw new Error('Access denied to this receipt');
    }

    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'DELETE' && path.includes('/assignments/all')) {
      // Clear all assignments
      await singleTableService.clearAllItemAssignments(receiptId);
      return { message: 'All assignments cleared successfully' };
    }
    
    if (event.httpMethod === 'PUT' && path.includes('/assignments/bulk')) {
      // Bulk update assignments
      const { updates } = body;
      if (!updates || !Array.isArray(updates)) {
        throw new Error('Updates array is required for bulk assignment');
      }
      
      await singleTableService.bulkUpdateItemAssignments(receiptId, updates);
      return { message: 'Bulk assignments updated successfully' };
    }
    
    if (event.httpMethod === 'PUT' && itemId) {
      // Single item assignment
      const { assignedUsers } = body;
      if (!Array.isArray(assignedUsers)) {
        throw new Error('assignedUsers array is required');
      }
      
      await singleTableService.updateItemAssignment(receiptId, itemId, assignedUsers);
      return { message: 'Item assignment updated successfully' };
    }

    throw new Error('Invalid request path or method');
  });
};