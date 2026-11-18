import { Component, LOCALE_ID, computed, inject, input, output, signal } from '@angular/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ContactDto } from '../api/types';
import { initials, sameName, shortDate } from '../contacts/contact-format';

/** How many contacts the dropdown lists above "add as a new person". */
const MAX_MATCHES = 8;
/** How many recent people are offered as one-tap chips before typing. */
const MAX_RECENT = 6;

/** Most recently used first, then most used; never-used contacts last. */
function byRecency(a: ContactDto, b: ContactDto): number {
  return (
    (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || b.receiptCount - a.receiptCount
  );
}

/**
 * The one field people are added to a receipt through. Typing filters the
 * owner's contacts and always ends with "add as a new person"; before
 * typing, recent contacts are one tap away. It only reports the choice —
 * the parent makes the request — and clears itself after each one so the
 * next name can be typed straight away.
 *
 * With no `contacts` (a co-owner, who has no book for this receipt) it is
 * just a name field.
 */
@Component({
  selector: 'app-people-picker',
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './people-picker.html',
  styleUrl: './people-picker.scss',
})
export class PeoplePicker {
  private locale = inject(LOCALE_ID);

  /** The owner's address book. */
  readonly contacts = input<ContactDto[]>([]);
  /** Contacts already on the receipt, which are not offered again. */
  readonly takenContactIds = input<number[]>([]);
  /** Names already on the receipt, so a repeat reads "Add another". */
  readonly takenNames = input<string[]>([]);
  /** A request is in flight: nothing can be picked. */
  readonly disabled = input(false);

  readonly contactPicked = output<ContactDto>();
  readonly newPerson = output<string>();
  /** "Same people as last receipt", with the contacts that would add. */
  readonly previousPicked = output<ContactDto[]>();

  /** What is typed in the field. */
  readonly query = signal('');
  private readonly trimmed = computed(() => this.query().trim());

  private readonly available = computed(() => {
    const taken = new Set(this.takenContactIds());
    return this.contacts()
      .filter(c => !taken.has(c.contactId))
      .sort(byRecency);
  });

  /** Chips shown before typing. A contact on no receipts isn't "recent". */
  readonly recent = computed(() =>
    this.available()
      .filter(c => c.lastUsedAt)
      .slice(0, MAX_RECENT),
  );

  /** Who "Same people as last receipt" would add. */
  readonly previous = computed(() => this.available().filter(c => c.onPreviousReceipt));

  /** Contacts matching the typed text: an exact name first, then by recency. */
  readonly matches = computed(() => {
    const q = this.trimmed().toLowerCase();
    if (!q) return [];
    return this.available()
      .filter(c => c.displayName.toLowerCase().includes(q))
      .sort((a, b) => Number(sameName(b.displayName, q)) - Number(sameName(a.displayName, q)))
      .slice(0, MAX_MATCHES);
  });

  /** The typed name already belongs to someone, on this receipt or in the book. */
  readonly nameExists = computed(() => {
    const q = this.trimmed();
    return (
      this.contacts().some(c => sameName(c.displayName, q)) ||
      this.takenNames().some(n => sameName(n, q))
    );
  });

  readonly newName = this.trimmed;

  /** Keeps the field empty after a pick instead of showing "[object Object]". */
  readonly blank = () => '';

  choose(value: ContactDto | string, box: HTMLInputElement): void {
    box.value = '';
    this.query.set('');
    if (typeof value === 'string') this.newPerson.emit(value);
    else this.contactPicked.emit(value);
  }

  readonly initials = initials;

  /** "Nov 3", with the year once it isn't this one. */
  lastOn(contact: ContactDto): string {
    return contact.lastUsedAt ? shortDate(contact.lastUsedAt, this.locale) : '';
  }

  /** A dropdown row's second line: what tells this contact from another. */
  meta(contact: ContactDto): string {
    const last = this.lastOn(contact);
    const used = last ? `Last on ${last}` : 'Not on a receipt yet';
    return contact.hasAccount ? `Has an account · ${used}` : used;
  }

  /** A chip's text. Two recent people with one name are told apart by date. */
  chipLabel(contact: ContactDto): string {
    const shared = this.recent().some(
      c => c !== contact && sameName(c.displayName, contact.displayName),
    );
    return shared ? `${contact.displayName} · ${this.lastOn(contact)}` : contact.displayName;
  }
}
