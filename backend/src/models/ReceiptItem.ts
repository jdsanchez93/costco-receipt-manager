export interface ReceiptItem {
  PK: string;
  SK: string;
  item_number: string;
  item_name: string;
  price: number;
  discount: number;
  receipt_id: string;
  assigned_users: string[];
}