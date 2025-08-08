export interface UserReceipt {
  PK: string; // USER#user_id
  SK: string; // RECEIPT#receipt_id
  status: 'pending' | 'processed' | 'error';
  created_at: string;
  fileName?: string;
  fileUrl?: string;
  totalAmount?: number;
  receiptDate?: string;
  validationStatus?: 'pending' | 'confirmed' | 'disputed';
  validatedBy?: string;
  validatedAt?: string;
  comments?: string;
}