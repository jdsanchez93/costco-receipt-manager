import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const uploadReceipt = async (file: File, token: string) => {
  const formData = new FormData();
  formData.append('receipt', file);

  const response = await api.post('/api/receipts/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
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