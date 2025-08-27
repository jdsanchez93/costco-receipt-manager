const { AuthUtils } = require('/opt/nodejs/auth-utils');
const axios = require('axios');

const authUtils = new AuthUtils();

exports.handler = async (event) => {
  return await authUtils.handleRequest(event, async (event, user) => {
    const s3UploadApiUrl = process.env.S3_UPLOAD_API_URL;
    
    if (!s3UploadApiUrl) {
      throw new Error('S3 upload API not configured');
    }

    const body = JSON.parse(event.body || '{}');
    // Handle both contentType (from frontend) and content_type formats
    const contentType = body.contentType || body.content_type || 'image/jpeg';
    
    try {
      // Forward the request to the external S3 upload API
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      
      const response = await axios.post(s3UploadApiUrl, {
        content_type: contentType
      }, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      return {
        receiptId: response.data.receipt_id,
        uploadUrl: response.data.upload_url,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      if (error.response) {
        console.error('External API error response:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
        throw new Error(`Upload API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      console.error('Request to external API failed:', error.message);
      throw new Error(`Failed to get upload URL: ${error.message}`);
    }
  });
};