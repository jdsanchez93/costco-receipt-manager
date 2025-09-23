const { SingleTableService } = require('/opt/nodejs/single-table-service');
const { AuthUtils } = require('/opt/nodejs/auth-utils');

const singleTableService = new SingleTableService();
const authUtils = new AuthUtils();

exports.handler = async (event) => {
  return await authUtils.handlePublicRequest(event, async (event) => {
    const shareToken = event.pathParameters?.shareToken;
    
    if (!shareToken) {
      throw new Error('Share token is required');
    }

    const sharedReceipt = await singleTableService.getSharedReceipt(shareToken);

    // Get receipt data
    const [items, members, geometry] = await Promise.all([
      singleTableService.getReceiptItems(sharedReceipt.receipt_id),
      singleTableService.getReceiptMembers(sharedReceipt.receipt_id),
      singleTableService.getReceiptGeometry(sharedReceipt.receipt_id)
    ]);
    
    return {
      receiptId: sharedReceipt.receipt_id,
      items,
      members,
      geometry,
      shareInfo: {
        createdAt: sharedReceipt.created_at,
        expiresAt: new Date(sharedReceipt.expires_at * 1000).toISOString()
      }
    };
  });
};