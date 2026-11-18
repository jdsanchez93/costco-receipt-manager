import { Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { concatMap, from } from 'rxjs';

import { ContactsApi } from '../api/contacts-api';
import { ContactDto, DuplicateContactsDto } from '../api/types';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { Loadable } from '../receipts/receipt-view';
import { ContactAvatar } from './contact-avatar';
import { contactMeta, plural } from './contact-format';
import { ContactReview } from './contact-review';
import { errorText } from './errors';

/**
 * The address book: "Needs review" on top — placeholders that share a name
 * — then everyone, most recently used first, searchable. The caller's own
 * contact is never in it.
 */
@Component({
  selector: 'app-contacts',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    ContactAvatar,
  ],
  templateUrl: './contacts.html',
  styleUrl: './contacts.scss',
})
export class Contacts {
  private api = inject(ContactsApi);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private locale = inject(LOCALE_ID);
  private review = inject(ContactReview);

  readonly duplicates = this.review.duplicates;

  state = signal<Loadable<ContactDto[]>>({ kind: 'loading' });
  /** What is typed in the search field. */
  query = signal('');
  /** A merge is in flight. */
  busy = signal(false);

  readonly shown = computed(() => {
    const s = this.state();
    if (s.kind !== 'ok') return [];
    const q = this.query().trim().toLowerCase();
    return q ? s.data.filter(c => c.displayName.toLowerCase().includes(q)) : s.data;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.review.refresh();
    this.api.getContacts().subscribe({
      next: data => this.state.set({ kind: 'ok', data }),
      error: err => this.state.set({ kind: 'error', message: errorText(err, 'Could not load your contacts.') }),
    });
  }

  /** A row's second line: how much they're used, which is what tells two Johns apart. */
  meta(c: ContactDto): string {
    return contactMeta(c, this.locale);
  }

  /** Folds every contact in the group into its most recently used one. */
  mergeAll(group: DuplicateContactsDto): void {
    if (this.busy() || !group.canMergeAll) return;
    const [into, ...rest] = group.contacts;
    const receipts = group.contacts.reduce((n, c) => n + c.receiptCount, 0);
    const name = group.displayName;

    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data: {
          title: `Merge ${group.contacts.length} contacts named ${name}?`,
          message:
            (receipts > 0 ? `Their ${plural(receipts, 'receipt')} will all list the same ${name}. ` : '') +
            `This can't be undone.`,
          confirmLabel: 'Merge',
        },
      })
      .afterClosed()
      .subscribe(ok => {
        if (ok !== true) return;
        this.busy.set(true);
        // One after another: a failure part-way leaves the ones before it
        // merged, and the reload shows what is left.
        from(rest)
          .pipe(concatMap(c => this.api.mergeContact(c.contactId, into.contactId)))
          .subscribe({
            error: err => {
              this.busy.set(false);
              this.snackBar.open(errorText(err, 'Could not merge them.'), 'Dismiss', { duration: 4000 });
              this.load();
            },
            complete: () => {
              this.busy.set(false);
              this.snackBar.open(`Merged into one ${name}.`, 'Dismiss', { duration: 3000 });
              this.load();
            },
          });
      });
  }
}
