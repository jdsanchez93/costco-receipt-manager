// Single Table Design Types for Frontend

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

// Receipt Item
export interface ReceiptItem {
  PK: string; // RECEIPT#{receipt_id}
  SK: string; // ITEM#{item_id}
  entity_type: 'RECEIPT_ITEM';
  item_number: string;
  item_name: string;
  price: number;
  discount: number;
  receipt_id: string;
  assigned_users: string[];
  created_at: string;
}

// Receipt Member (for both authenticated and placeholder users)
export interface ReceiptMember {
  PK: string; // RECEIPT#{receipt_id}
  SK: string; // USER#{user_id}
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
  
  // Validation fields
  validation_status?: 'pending' | 'confirmed' | 'disputed';
  validated_by?: string;
  validated_at?: string;
  comments?: string;
}


// Receipt Share (response DTO from API)
export interface ReceiptShare {
  PK: string; // SHARE#{share_token}
  SK: string; // RECEIPT#{receipt_id}
  receipt_id: string;
  owner_user_id: string;
  share_token: string;
  created_at: string;
  expires_at: string; // ISO string format
  is_active: boolean;
  current_uses: number;
  share_url: string; // Computed by backend
}

// Receipt Geometry
export interface ReceiptGeometry {
  PK: string; // RECEIPT#{receipt_id}
  SK: string; // GEOMETRY#{field}#{type}
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

// Placeholder User
export interface PlaceholderUser {
  PK: string; // USER#{placeholder_id}
  SK: string; // RECEIPT#{receipt_id}
  entity_type: 'PLACEHOLDER_USER';
  receipt_id: string;
  placeholder_id: string;
  display_name: string;
  status: 'unclaimed' | 'claimed';
  created_at: string;
}

// Geometry Data (organized by field)
export interface GeometryData {
  subtotal?: {
    label?: ReceiptGeometry;
    value?: ReceiptGeometry;
  };
  tax?: {
    label?: ReceiptGeometry;
    value?: ReceiptGeometry;
  };
  total?: {
    label?: ReceiptGeometry;
    value?: ReceiptGeometry;
  };
}

// Shared Receipt Response
export interface SharedReceiptResponse {
  receiptId: string;
  items: ReceiptItem[];
  members: ReceiptMember[];
  geometry: GeometryData;
  shareInfo: {
    createdAt: string;
    expiresAt: string;
  };
}

// API Request/Response Types
export interface AddMemberRequest {
  displayName: string;
  email?: string;
  userType: 'authenticated' | 'placeholder';
}

export interface CreateShareRequest {
  expiresInDays?: number;
}

export interface CreateShareResponse {
  message: string;
  share_token: string;
  share_url: string;
  expires_at: string;
}