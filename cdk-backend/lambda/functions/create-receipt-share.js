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
    const { expiresInDays = 30 } = body;
    
    const share = await singleTableService.createReceiptShare(
      receiptId,
      user.userId,
      expiresInDays
    );
    
    // Add the full share URL to the response
    const baseUrl = `https://${event.headers?.Host || event.requestContext?.domainName}`;
    share.shareUrl = `${baseUrl}/shared/${share.share_token}`;
    
    return {
      message: 'Share created successfully',
      share
    };
  });
};