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
    
    return sharedReceipt;
  });
};