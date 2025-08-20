import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export interface S3DownloadResponse {
  download_url: string;
  expires_in?: number;
}

export const getS3DownloadUrl = async (
  receiptId: string,
  userToken: string
): Promise<S3DownloadResponse> => {
  const apiUrl = process.env.S3_DOWNLOAD_API_URL;
  
  if (!apiUrl) {
    throw new Error('S3_DOWNLOAD_API_URL not configured');
  }

  try {
    const response = await axios.get(`${apiUrl}/${receiptId}`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
      },
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Error getting S3 download URL:', error.response?.data || error.message);
    throw new Error(`Failed to get S3 download URL: ${error.response?.data?.message || error.message}`);
  }
};