// TypeScript mirrors of the backend DTOs in
// api/CostcoReceipts.Api/Models/ReceiptDtos.cs and ApiRequests.cs.
// ASP.NET Core serializes PascalCase properties as camelCase by default,
// so field names here match the JSON on the wire.

export type ReceiptRole = 'owner' | 'editor';

/**
 * A receipt's OCR processing status, set to 'pending' when the upload URL is
 * issued and flipped to 'completed' or 'failed' once the receipt-processor
 * Lambda reports in. Mirrors the backend ReceiptProcessingStatus constants.
 */
export type ReceiptProcessingStatus = 'pending' | 'completed' | 'failed';

/**
 * Receipt-level metadata — currently just enough to know whether OCR has
 * finished. Mirrors the backend ReceiptSummaryDto.
 */
export interface ReceiptSummaryDto {
  receiptId: string;
  processingStatus: ReceiptProcessingStatus;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /**
   * The caller uploaded this receipt, so its members come from the caller's
   * own contacts and the members panel offers them. A co-owner adds by name
   * only.
   */
  uploadedByMe: boolean;
}

/**
 * An entry in the caller's address book, from GET /api/contacts. Never the
 * caller themselves. Mirrors the backend ContactDto.
 */
export interface ContactDto {
  contactId: number;
  /** The account's own name when the contact has one. */
  displayName: string;
  hasAccount: boolean;
  /** How many receipts this contact is on. */
  receiptCount: number;
  /** ISO-8601 timestamp of when they were last added to a receipt, or null if on none. */
  lastUsedAt: string | null;
  /**
   * On the receipt the caller uploaded just before the one passed as
   * `forReceipt`. Always false without it.
   */
  onPreviousReceipt: boolean;
}

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
 * Body for POST /api/receipts/receipt/{receiptId}/members: an existing
 * contact from the uploader's address book, or a new person by name, who
 * becomes a fresh placeholder there — a name is never matched to an existing
 * contact. `role` defaults to 'editor' on the backend. Matches the backend
 * AddReceiptMemberRequest DTO.
 */
export type AddReceiptMemberRequest = ({ contactId: number } | { displayName: string }) & {
  role?: ReceiptRole;
};

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
 * Server-computed comparison of the OCR'd subtotal against the sum of the
 * receipt's items. `matches`/`ocrSubtotal`/`difference` are all null when
 * Textract has no subtotal field or it's unparseable — render that as
 * "unverified", not a false mismatch. Mirrors the backend SubtotalMatchDto.
 */
export interface SubtotalMatchDto {
  ocrSubtotal: number | null;
  calculatedSubtotal: number;
  difference: number | null;
  matches: boolean | null;
}

/**
 * The Textract OCR block. Only `subtotalMatch` is modeled — nothing in the
 * app renders the raw label/value/bounding-box fields the backend also
 * sends. Mirrors the backend GeometryDto.
 */
export interface GeometryDto {
  subtotalMatch: SubtotalMatchDto;
}

/**
 * Body for POST /api/receipts/get-upload-url. Matches the backend
 * GetUploadUrlRequest DTO. `contentType` defaults to image/jpeg on the
 * backend when omitted; allowed values are image/jpeg, image/jpg,
 * image/png (what Textract can OCR).
 */
export interface GetUploadUrlRequest {
  contentType?: string;
}

/**
 * Response from POST /api/receipts/get-upload-url. The backend creates the
 * Receipt row and an owner ReceiptMember *before* returning this, so the
 * receipt is already visible via getUserReceipts() even before the file is
 * PUT to S3 or OCR has run. Mirrors the backend GetUploadUrlResponse.
 */
export interface GetUploadUrlResponse {
  receiptId: string;
  uploadUrl: string;
  /** Seconds until `uploadUrl` expires. */
  expiresIn: number;
}

/**
 * Response from GET /api/receipts/get-download-url/{receiptId}. Mirrors
 * the backend GetDownloadUrlResponse. Note the backend returns a presigned
 * URL even for a receipt whose image was never actually uploaded to S3 —
 * a failed image load doesn't distinguish "still processing" from
 * "nothing there."
 */
export interface GetDownloadUrlResponse {
  downloadUrl: string;
  /** Seconds until `downloadUrl` expires. */
  expiresIn: number;
}

/**
 * A member as anyone holding a share link sees them — no email, no user id.
 * Mirrors the backend SharedMemberDto.
 */
export interface SharedMemberDto {
  id: number;
  displayName: string;
}

/**
 * Public read-only payload for a shared receipt, from the anonymous
 * GET /api/receipts/shared/{shareToken}. Mirrors the backend
 * SharedReceiptResponse (api/CostcoReceipts.Api/Models/ReceiptDtos.cs).
 */
export interface SharedReceiptResponse {
  kind: 'public';
  receiptId: string;
  items: ReceiptItemDto[];
  members: SharedMemberDto[];
  geometry: GeometryDto;
  shareInfo: {
    /** ISO-8601 timestamp. */
    createdAt: string;
    /** ISO-8601 timestamp. */
    expiresAt: string;
  };
}

/**
 * Returned by the same endpoint, instead of the receipt, when the caller is
 * signed in and already a member — even if the link has since expired or
 * been deactivated. Mirrors the backend SharedReceiptMemberResponse.
 */
export interface SharedReceiptMemberResponse {
  kind: 'member';
  receiptId: string;
}

/** Either answer from GET /api/receipts/shared/{shareToken}, told apart by `kind`. */
export type SharedReceiptLookup = SharedReceiptResponse | SharedReceiptMemberResponse;

/**
 * The caller's own profile, from GET /api/me. `displayName` is the name every
 * receipt they're on shows, whatever the receipt owner called their contact.
 * Mirrors the backend MeDto.
 * `email` comes from the identity provider and isn't editable.
 */
export interface MeDto {
  userId: string;
  displayName: string;
  email: string | null;
  /**
   * The name is still the user's sub, standing in because the backend's
   * Auth0 /userinfo fetch failed. The shell prompts for a real one.
   */
  needsName: boolean;
}
