import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export interface S3UploadResponse {
  upload_url: string;
  receipt_id: string;
  expires_in: number;
}

export const getS3UploadUrl = async (
  userToken: string, 
  contentType?: string
): Promise<S3UploadResponse> => {
  const apiUrl = process.env.S3_UPLOAD_API_URL;
  
  if (!apiUrl) {
    throw new Error('S3_UPLOAD_API_URL not configured');
  }

  const requestBody: { content_type?: string } = {};
  if (contentType) {
    requestBody.content_type = contentType;
  }

  try {
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Error getting S3 upload URL:', error.response?.data || error.message);
    throw new Error(`Failed to get S3 upload URL: ${error.response?.data?.message || error.message}`);
  }
};