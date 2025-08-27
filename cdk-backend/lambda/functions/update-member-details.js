const { SingleTableService } = require('/opt/nodejs/single-table-service');
const { AuthUtils } = require('/opt/nodejs/auth-utils');

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
    const { email, name } = body;
    
    // Use the authenticated user's details from JWT
    const displayName = name || user.name || user.email;
    const emailAddress = email || user.email;
    
    if (!displayName) {
      throw new Error('Display name is required');
    }
    
    await singleTableService.updateMemberDetails(
      receiptId,
      user.userId,
      displayName,
      emailAddress
    );
    
    return {
      message: 'Member details updated successfully',
      receiptId,
      userId: user.userId,
      displayName,
      email: emailAddress
    };
  });
};