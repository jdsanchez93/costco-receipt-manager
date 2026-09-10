import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AddReceiptMemberRequest,
  ItemAssignmentUpdate,
  ReceiptItemDto,
  ReceiptMemberDto,
  ReceiptMemberMutationResponse,
  ReceiptRole,
} from './types';

@Injectable({ providedIn: 'root' })
export class ReceiptsApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * All receipts the current authenticated user is a member of.
   * Backend: GET /api/receipts/user-receipts.
   */
  getUserReceipts(): Observable<ReceiptMemberDto[]> {
    return this.http.get<ReceiptMemberDto[]>(`${this.base}/receipts/user-receipts`);
  }

  /**
   * All items on a receipt, ordered by ItemIndex.
   * Backend: GET /api/receipts/receipt/{receiptId}/items.
   */
  getReceiptItems(receiptId: string): Observable<ReceiptItemDto[]> {
    return this.http.get<ReceiptItemDto[]>(
      `${this.base}/receipts/receipt/${encodeURIComponent(receiptId)}/items`,
    );
  }

  /**
   * All members on a receipt, ordered by AddedAt.
   * Backend: GET /api/receipts/receipt/{receiptId}/members.
   */
  getReceiptMembers(receiptId: string): Observable<ReceiptMemberDto[]> {
    return this.http.get<ReceiptMemberDto[]>(
      `${this.base}/receipts/receipt/${encodeURIComponent(receiptId)}/members`,
    );
  }

  /**
   * Add a placeholder participant to a receipt. Requires the caller to hold
   * the ReceiptOwner policy. Backend: POST /api/receipts/receipt/{receiptId}/members
   * with body { displayName, email?, role? }. Returns a { message, member } envelope.
   */
  addReceiptMember(
    receiptId: string,
    request: AddReceiptMemberRequest,
  ): Observable<ReceiptMemberMutationResponse> {
    return this.http.post<ReceiptMemberMutationResponse>(
      `${this.base}/receipts/receipt/${encodeURIComponent(receiptId)}/members`,
      request,
    );
  }

  /**
   * Change one member's role on a receipt. Requires ReceiptOwner. Backend:
   * PUT /api/receipts/receipt/{receiptId}/members/{memberId}/role with body
   * { role }. The backend rejects demoting the last owner with a 409.
   */
  updateMemberRole(
    receiptId: string,
    memberId: number,
    role: ReceiptRole,
  ): Observable<ReceiptMemberMutationResponse> {
    return this.http.put<ReceiptMemberMutationResponse>(
      `${this.base}/receipts/receipt/${encodeURIComponent(receiptId)}/members/${memberId}/role`,
      { role },
    );
  }

  /**
   * Remove a member from a receipt. Requires ReceiptOwner. Backend:
   * DELETE /api/receipts/receipt/{receiptId}/members/{memberId}. Cascades to
   * the member's item assignments. The backend rejects removing the last
   * owner with a 409.
   */
  removeReceiptMember(receiptId: string, memberId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/receipts/receipt/${encodeURIComponent(receiptId)}/members/${memberId}`,
    );
  }

  /**
   * Replace the set of members assigned to a single receipt item.
   * Backend: PUT /api/receipts/receipt/{receiptId}/items/{itemId}/assignment
   * with body { assignedMemberIds: number[] }. Requires the caller to hold
   * the ReceiptEditor policy (owner or editor).
   */
  updateItemAssignment(
    receiptId: string,
    itemId: number,
    assignedMemberIds: number[],
  ): Observable<void> {
    return this.http.put<void>(
      `${this.base}/receipts/receipt/${encodeURIComponent(receiptId)}/items/${itemId}/assignment`,
      { assignedMemberIds },
    );
  }

  /**
   * Replace the assignment set on multiple items in one request.
   * Backend: PUT /api/receipts/receipt/{receiptId}/items/assignments/bulk
   * with body { updates: ItemAssignmentUpdate[] }. Requires ReceiptEditor.
   * The backend applies all updates in a single transaction — either all
   * land or none do.
   */
  bulkUpdateAssignments(
    receiptId: string,
    updates: ItemAssignmentUpdate[],
  ): Observable<void> {
    return this.http.put<void>(
      `${this.base}/receipts/receipt/${encodeURIComponent(receiptId)}/items/assignments/bulk`,
      { updates },
    );
  }
}
