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

export const getReceiptDownloadUrl = async (receiptId: string, token: string) => {
  const response = await api.get(`/api/receipts/get-download-url/${receiptId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const getReceiptGeometry = async (receiptId: string, token: string) => {
  const response = await api.get(`/api/receipts/receipt/${receiptId}/geometry`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const validateReceiptSubtotal = async (
  receiptId: string, 
  isValid: boolean, 
  comments: string,
  token: string
) => {
  const response = await api.post(`/api/receipts/validate/${receiptId}`, {
    isValid,
    comments,
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

// ==================== RECEIPT MEMBERS ====================

export const getReceiptMembers = async (receiptId: string, token: string) => {
  const response = await api.get(`/api/receipts/receipt/${receiptId}/members`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const addReceiptMember = async (
  receiptId: string,
  memberData: {
    displayName: string;
    email?: string;
    userType: 'authenticated' | 'placeholder';
    role?: 'owner' | 'editor';
  },
  token: string
) => {
  const response = await api.post(`/api/receipts/receipt/${receiptId}/members`, memberData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const updateMemberDetails = async (
  receiptId: string, 
  email: string, 
  name: string | undefined, 
  token: string
) => {
  const response = await api.put(`/api/receipts/receipt/${receiptId}/members/update-details`, {
    email,
    name
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

// ==================== RECEIPT SHARING ====================

export const createReceiptShare = async (
  receiptId: string, 
  expiresInDays: number = 30,
  token: string
) => {
  const response = await api.post(`/api/receipts/receipt/${receiptId}/share`, {
    expiresInDays,
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const getReceiptShares = async (receiptId: string, token: string) => {
  const response = await api.get(`/api/receipts/receipt/${receiptId}/shares`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};

export const getSharedReceipt = async (shareToken: string) => {
  const response = await api.get(`/api/receipts/shared/${shareToken}`);
  return response.data;
};

// Item Assignment APIs
export const updateItemAssignment = async (receiptId: string, itemId: string, assignedUsers: string[], token: string) => {
  const response = await api.put(`/api/receipts/receipt/${receiptId}/items/${itemId}/assignment`, {
    assignedUsers
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const bulkUpdateItemAssignments = async (receiptId: string, updates: Array<{ itemId: string; assignedUsers: string[] }>, token: string) => {
  const response = await api.put(`/api/receipts/receipt/${receiptId}/items/assignments/bulk`, {
    updates
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const clearAllItemAssignments = async (receiptId: string, token: string) => {
  const response = await api.delete(`/api/receipts/receipt/${receiptId}/items/assignments/all`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const deleteReceipt = async (receiptId: string, token: string) => {
  const response = await api.delete(`/api/receipts/receipt/${receiptId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};