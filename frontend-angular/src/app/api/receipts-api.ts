import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ReceiptMemberDto } from './types';

@Injectable({ providedIn: 'root' })
export class ReceiptsApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * All receipts the current authenticated user is a member of.
   * Backend: GET /api/receipts/user-receipts (returns their ReceiptMember rows,
   * projected through Contact so identity fields are populated).
   */
  getUserReceipts(): Observable<ReceiptMemberDto[]> {
    return this.http.get<ReceiptMemberDto[]>(`${this.base}/receipts/user-receipts`);
  }
}
