const { AuthUtils } = require('/opt/nodejs/auth-utils');
const { SingleTableService } = require('/opt/nodejs/single-table-service');
const axios = require('axios');

const authUtils = new AuthUtils();
const singleTableService = new SingleTableService();

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

    const s3DownloadApiUrl = process.env.S3_DOWNLOAD_API_URL;
    
    if (!s3DownloadApiUrl) {
      throw new Error('S3 download API not configured');
    }
    
    try {
      // Forward the request to the external S3 download API
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      
      const response = await axios.get(`${s3DownloadApiUrl}/${receiptId}`, {
        headers: {
          'Authorization': authHeader
        },
        timeout: 10000
      });
      
      return {
        downloadUrl: response.data.download_url,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      if (error.response) {
        throw new Error(`Download API error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
      }
      throw new Error(`Failed to get download URL: ${error.message}`);
    }
  });
};