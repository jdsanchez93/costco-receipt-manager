import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ContactDetailDto, ContactDto, ContactReviewDto } from './types';

/**
 * The caller's address book. Every call only ever reaches the caller's own
 * book; another owner's contact id reads as a 404.
 */
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

  /** GET /api/contacts/{id}: the receipts they're on and who they could merge into. */
  getContact(contactId: number): Observable<ContactDetailDto> {
    return this.http.get<ContactDetailDto>(`${this.base}/contacts/${contactId}`);
  }

  /** GET /api/contacts/review: placeholders that share a name. */
  getReview(): Observable<ContactReviewDto> {
    return this.http.get<ContactReviewDto>(`${this.base}/contacts/review`);
  }

  /** PATCH /api/contacts/{id}. Placeholders only: 409 for an account. */
  renameContact(contactId: number, displayName: string): Observable<ContactDto> {
    return this.http.patch<ContactDto>(`${this.base}/contacts/${contactId}`, { displayName });
  }

  /** DELETE /api/contacts/{id}. 409 while they're on any receipt, or have an account. */
  deleteContact(contactId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/contacts/${contactId}`);
  }

  /**
   * POST /api/contacts/{id}/merge: `contactId`'s receipts move to
   * `intoContactId` and `contactId` is deleted. Resolves to the contact
   * merged into. 409 if they share a receipt or `contactId` has an account.
   */
  mergeContact(contactId: number, intoContactId: number): Observable<ContactDto> {
    return this.http.post<ContactDto>(`${this.base}/contacts/${contactId}/merge`, { intoContactId });
  }
}
