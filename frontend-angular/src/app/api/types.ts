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
