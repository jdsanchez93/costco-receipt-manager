const { SingleTableService } = require('/opt/nodejs/single-table-service');
const { AuthUtils } = require('/opt/nodejs/auth-utils');

const singleTableService = new SingleTableService();
const authUtils = new AuthUtils();

exports.handler = async (event) => {
  console.log('Get Receipt Geometry - Event:', JSON.stringify(event, null, 2));

  return await authUtils.handleRequest(event, async (event, user) => {
    const receiptId = event.pathParameters?.receiptId;
    
    if (!receiptId) {
      throw new Error('Receipt ID is required');
    }

    // Verify the user is a member of this receipt
    const userReceipts = await singleTableService.getUserReceipts(user.userId);
    const membership = userReceipts.find(r => r.receipt_id === receiptId);

    if (!membership) {
      throw new Error('Receipt not found or access denied');
    }

    // Get geometry data using single table service
    const geometryData = await singleTableService.getReceiptGeometry(receiptId);

    return geometryData;
  });
};