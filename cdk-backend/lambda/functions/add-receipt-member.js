const { SingleTableService } = require('/opt/nodejs/single-table-service');
const { AuthUtils } = require('/opt/nodejs/auth-utils');
const { v4: uuidv4 } = require('uuid');

const singleTableService = new SingleTableService();
const authUtils = new AuthUtils();

exports.handler = async (event) => {
  return await authUtils.handleRequest(event, async (event, user) => {
    const receiptId = event.pathParameters?.receiptId;
    
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
    const { displayName, email, userType = 'placeholder' } = body;
    
    if (!displayName) {
      throw new Error('Display name is required');
    }

    // Generate a unique user ID for placeholder members
    const memberId = userType === 'authenticated' && email ? email : uuidv4();
    
    const member = await singleTableService.createReceiptMember(
      receiptId,
      memberId,
      displayName,
      email || '',
      userType
    );
    
    return {
      message: 'Member added successfully',
      member
    };
  });
};