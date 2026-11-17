import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ContactDto } from './types';

@Injectable({ providedIn: 'root' })
export class ContactsApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * The caller's address book, most recently used first, without the caller
   * themselves. Backend: GET /api/contacts?q=&forReceipt=. `q` keeps names
   * containing it, exact matches first. `forReceipt` marks who was on the
   * receipt the caller uploaded just before that one (`onPreviousReceipt`).
   */
  getContacts(options: { q?: string; forReceipt?: string } = {}): Observable<ContactDto[]> {
    const params: Record<string, string> = {};
    if (options.q) params['q'] = options.q;
    if (options.forReceipt) params['forReceipt'] = options.forReceipt;
    return this.http.get<ContactDto[]>(`${this.base}/contacts`, { params });
  }
}
