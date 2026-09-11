// TypeScript mirrors of the backend DTOs in
// api/CostcoReceipts.Api/Models/ReceiptDtos.cs and ApiRequests.cs.
// ASP.NET Core serializes PascalCase properties as camelCase by default,
// so field names here match the JSON on the wire.

export type ReceiptRole = 'owner' | 'editor';

/**
 * One person's membership on one receipt. Identity fields (userId,
 * displayName, email) come through the linked Contact on the backend but
 * are projected flat into this shape for the client.
 */
export interface ReceiptMemberDto {
  id: number;
  receiptId: string;
  contactId: number;
  /** Auth0 sub if this member is an authenticated user; null for placeholders. */
  userId: string | null;
  displayName: string;
  email: string | null;
  role: ReceiptRole;
  addedByMemberId: number | null;
  /** ISO-8601 timestamp. */
  addedAt: string;
  /** ISO-8601 timestamp, or null. */
  updatedAt: string | null;
  validationStatus: string | null;
  validatedAt: string | null;
  comments: string | null;
}

/**
 * One item on a receipt. `assignedMemberIds` holds ReceiptMember ids
 * (not user ids) — resolve them against the receipt's members list to
 * get display names.
 */
export interface ReceiptItemDto {
  id: number;
  receiptId: string;
  itemIndex: number;
  itemNumber: string | null;
  itemName: string;
  price: number;
  discount: number | null;
  assignedMemberIds: number[];
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/**
 * A single row in a bulk-assignment PUT — replaces the assignment set
 * on one item with the given ids. Matches the backend
 * ItemAssignmentUpdate DTO exactly.
 */
export interface ItemAssignmentUpdate {
  itemId: number;
  assignedMemberIds: number[];
}

/**
 * Body for POST /api/receipts/receipt/{receiptId}/members. Always creates a
 * fresh placeholder participant in the receipt owner's address book —
 * nothing is deduped by display name. Matches the backend
 * AddReceiptMemberRequest DTO.
 */
export interface AddReceiptMemberRequest {
  displayName: string;
  email?: string | null;
  /** Defaults to 'editor' on the backend when omitted. */
  role?: ReceiptRole;
}

/**
 * The `{ message, member }` envelope the backend returns from the add-member
 * and change-role endpoints.
 */
export interface ReceiptMemberMutationResponse {
  message: string;
  member: ReceiptMemberDto;
}

/**
 * One public share link for a receipt. Mirrors the backend ReceiptShareDto
 * (api/CostcoReceipts.Api/Models/ApiRequests.cs). `shareUrl` is built
 * server-side as `{Frontend:BaseUrl}/shared-receipt/{shareToken}`.
 *
 * `currentUses` is present for forward-compat but the backend never
 * increments it yet, so it is always 0 today.
 */
export interface ReceiptShareDto {
  id: number;
  receiptId: string;
  shareToken: string;
  shareUrl: string;
  ownerUserId: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp. */
  expiresAt: string;
  isActive: boolean;
  currentUses: number;
}

/**
 * The body returned from POST /api/receipts/receipt/{receiptId}/share.
 * Note it lacks `id` / `createdAt`, so callers re-fetch the list rather
 * than splicing this in. Matches the backend CreateReceiptShareResponse.
 */
export interface CreateShareResponse {
  shareToken: string;
  shareUrl: string;
  /** ISO-8601 timestamp. */
  expiresAt: string;
}

/**
 * Public read-only payload for a shared receipt, from the anonymous
 * GET /api/receipts/shared/{shareToken}. Mirrors the backend
 * SharedReceiptResponse (api/CostcoReceipts.Api/Models/ReceiptDtos.cs).
 *
 * The backend also sends a `geometry` (Textract OCR) block; it is omitted
 * here because the shared view doesn't render it.
 */
export interface SharedReceiptResponse {
  receiptId: string;
  items: ReceiptItemDto[];
  members: ReceiptMemberDto[];
  shareInfo: {
    /** ISO-8601 timestamp. */
    createdAt: string;
    /** ISO-8601 timestamp. */
    expiresAt: string;
  };
}
