// Single Table Design Models for DynamoDB

export interface BoundingBox {
  Width: number;
  Height: number;
  Left: number;
  Top: number;
}

export interface Point {
  X: number;
  Y: number;
}

// Base interface for all entities
interface BaseEntity {
  PK: string;
  SK: string;
  entity_type: string;
}

// Receipt Item Entity
export interface ReceiptItem extends BaseEntity {
  entity_type: 'RECEIPT_ITEM';
  item_number: string;
  item_name: string;
  price: number;
  discount: number;
  receipt_id: string;
  assigned_users: string[];
  created_at: string;
}

// Receipt Member Entity (for both authenticated and placeholder users)
export interface ReceiptMember extends BaseEntity {
  entity_type: 'RECEIPT_MEMBER';
  GSI1PK: string; // USER#{user_id}
  GSI1SK: string; // RECEIPT#{receipt_id}
  user_type: 'authenticated' | 'placeholder';
  display_name: string;
  receipt_id: string;
  added_by: string;
  added_at: string;
  
  // For authenticated users
  email?: string;
  user_id?: string;
  
  // For placeholder users
  placeholder_id?: string;
  
  // For claimed users
  claimed_from_placeholder?: string;
  claimed_at?: string;
}

// User Receipt Relationship Entity
export interface UserReceipt extends BaseEntity {
  entity_type: 'USER_RECEIPT';
  receipt_id: string;
  user_id: string;
  status: 'active' | 'pending' | 'processed' | 'error';
  joined_at?: string;
  created_at?: string;
  
  // Legacy fields from old structure
  fileName?: string;
  fileUrl?: string;
  totalAmount?: number;
  receiptDate?: string;
  validationStatus?: 'pending' | 'confirmed' | 'disputed';
  validatedBy?: string;
  validatedAt?: string;
  comments?: string;
}

// Placeholder User Entity
export interface PlaceholderUser extends BaseEntity {
  entity_type: 'PLACEHOLDER_USER';
  receipt_id: string;
  placeholder_id: string;
  display_name: string;
  status: 'unclaimed' | 'claimed';
  created_at: string;
}

// Receipt Share Entity
export interface ReceiptShare extends BaseEntity {
  entity_type: 'RECEIPT_SHARE';
  GSI2PK: string; // RECEIPT#{receipt_id}
  GSI2SK: string; // SHARE#{share_token}
  receipt_id: string;
  owner_user_id: string;
  share_token: string;
  created_at: string;
  expires_at: number; // TTL timestamp
  is_active: boolean;
  current_uses: number;
  max_uses?: number;
}

// Receipt Geometry Entity
export interface ReceiptGeometry extends BaseEntity {
  entity_type: 'RECEIPT_GEOMETRY';
  receipt_id: string;
  field_name: string; // subtotal, tax, total
  field_type: 'label' | 'value';
  text: string;
  confidence: number;
  bounding_box: BoundingBox;
  polygon: Point[];
  created_at: string;
}

// Union type for all entities
export type TableEntity = 
  | ReceiptItem 
  | ReceiptMember 
  | UserReceipt 
  | PlaceholderUser 
  | ReceiptShare 
  | ReceiptGeometry;

// Helper function to convert floats to Decimals for DynamoDB
export const convertFloats = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(convertFloats);
  } else if (obj !== null && typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertFloats(value);
    }
    return converted;
  } else if (typeof obj === 'number' && !Number.isInteger(obj)) {
    // Convert floats to strings for Decimal conversion
    return obj.toString();
  }
  return obj;
};