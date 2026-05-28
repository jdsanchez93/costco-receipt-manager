// Single Table Design Types for Frontend
// API uses camelCase serialization (matches C# property names)

// Receipt Member Roles
export type ReceiptRole = 'owner' | 'editor';

export interface BoundingBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface Point {
  x: number;
  y: number;
}

// Receipt Item
export interface ReceiptItem {
  PK: string; // RECEIPT#{receipt_id}
  SK: string; // ITEM#{item_id}
  entityType: 'RECEIPT_ITEM';
  itemNumber: string;
  itemName: string;
  price: number;
  discount: number;
  receiptId: string;
  assignedUsers: string[];
  createdAt: string;
}

// Receipt Member (for both authenticated and placeholder users)
export interface ReceiptMember {
  PK: string; // RECEIPT#{receipt_id}
  SK: string; // USER#{user_id}
  entityType: 'RECEIPT_MEMBER';
  GSI1PK: string; // USER#{user_id}
  GSI1SK: string; // RECEIPT#{receipt_id}
  userType: 'authenticated' | 'placeholder';
  displayName: string;
  receiptId: string;
  addedBy: string;
  addedAt: string;

  // For authenticated users
  email?: string;
  userId?: string;

  // For placeholder users
  placeholderId?: string;

  // For claimed users
  claimedFromPlaceholder?: string;
  claimedAt?: string;

  // Validation fields
  validationStatus?: 'pending' | 'confirmed' | 'disputed';
  validatedBy?: string;
  validatedAt?: string;
  comments?: string;

  // Role-based access control
  role: ReceiptRole;
}


// Receipt Share (response from API)
export interface ReceiptShare {
  PK: string; // SHARE#{share_token}
  SK: string; // RECEIPT#{receipt_id}
  GSI2PK: string; // RECEIPT#{receipt_id}
  GSI2SK: string; // SHARE#{share_token}
  entityType: 'RECEIPT_SHARE';
  receiptId: string;
  ownerUserId: string;
  shareToken: string;
  createdAt: string;
  expiresAt: number; // Unix timestamp
  isActive: boolean;
  currentUses: number;
  // Computed properties set by backend
  shareUrl?: string;
  expiresAtIso?: string; // ISO string format
}

// Receipt Geometry
export interface ReceiptGeometry {
  PK: string; // RECEIPT#{receipt_id}
  SK: string; // GEOMETRY#{field}#{type}
  entityType: 'RECEIPT_GEOMETRY';
  receiptId: string;
  fieldName: string; // subtotal, tax, total
  fieldType: 'label' | 'value';
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  polygon: Point[];
  createdAt: string;
}

// Placeholder User
export interface PlaceholderUser {
  PK: string; // USER#{placeholder_id}
  SK: string; // RECEIPT#{receipt_id}
  entityType: 'PLACEHOLDER_USER';
  receiptId: string;
  placeholderId: string;
  displayName: string;
  status: 'unclaimed' | 'claimed';
  createdAt: string;
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
  role?: ReceiptRole;
}

export interface UpdateMemberRoleRequest {
  role: ReceiptRole;
}

export interface CreateShareRequest {
  expiresInDays?: number;
}

export interface CreateShareResponse {
  message: string;
  shareToken: string;
  shareUrl: string;
  expiresAt: string;
}
