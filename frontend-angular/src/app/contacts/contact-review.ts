import { Injectable, computed, inject, signal } from '@angular/core';

import { ContactsApi } from '../api/contacts-api';
import { DuplicateContactsDto } from '../api/types';

/**
 * What the contacts page's "Needs review" holds, shared so the side nav can
 * badge it. The shell loads it once; the contacts pages refresh it after
 * anything that could change it.
 */
@Injectable({ providedIn: 'root' })
export class ContactReview {
  private api = inject(ContactsApi);

  readonly duplicates = signal<DuplicateContactsDto[]>([]);
  readonly count = computed(() => this.duplicates().length);

  /** Best-effort: a failed check leaves the last answer, and the page still works. */
  refresh(): void {
    this.api.getReview().subscribe({
      next: review => this.duplicates.set(review.duplicates),
      error: () => {},
    });
  }
}
