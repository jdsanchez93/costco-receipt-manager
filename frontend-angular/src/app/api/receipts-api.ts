import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ReceiptItemDto, ReceiptMemberDto } from './types';

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
}
