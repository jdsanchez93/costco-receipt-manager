import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const uploadReceipt = async (file: File, token: string) => {
  // Step 1: Get upload URL from your backend (which calls your API Gateway)
  const uploadUrlResponse = await api.post('/api/receipts/get-upload-url', {
    contentType: file.type
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const { uploadUrl, receiptId, expiresIn } = uploadUrlResponse.data;

  // Step 2: Upload directly to S3 using the presigned URL
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
  });

  return { 
    receiptId, 
    message: 'Upload successful',
    expiresIn 
  };
};

export const getUserReceipts = async (token: string) => {
  const response = await api.get('/api/receipts/user-receipts', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const getReceiptItems = async (receiptId: string, token: string) => {
  const response = await api.get(`/api/receipts/receipt/${receiptId}/items`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const getItems = async (token: string) => {
  const response = await api.get('/api/receipts/items', {
    headers: {
      Authorization: `Bearer ${token}`,

    },
  });

  return response.data;
};