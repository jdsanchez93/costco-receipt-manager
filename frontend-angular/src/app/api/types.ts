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
