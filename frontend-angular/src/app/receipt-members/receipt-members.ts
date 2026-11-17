import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { concatMap, forkJoin, from } from 'rxjs';

import { ContactsApi } from '../api/contacts-api';
import { ReceiptsApi } from '../api/receipts-api';
import {
  AddReceiptMemberRequest,
  ContactDto,
  ReceiptMemberDto,
  ReceiptRole,
} from '../api/types';
import { PeoplePicker } from '../people-picker/people-picker';
import { StatusBadge } from '../status-badge/status-badge';

/** How long an "Added …" toast offers Undo. */
const UNDO_MS = 6000;

/**
 * Member management for a receipt: add people, change a member's role,
 * remove a member. Owner-only actions are gated behind `canManage` —
 * non-owners see a read-only roster.
 *
 * People are added through one field (PeoplePicker). The uploader picks from
 * their contacts (`canPickContacts`); a co-owner, whose own contacts are a
 * different book from the receipt's, only adds by name. Everyone joins as an
 * editor and the role menu changes that.
 *
 * The component doesn't own the member list. `members` comes in as an input
 * and every successful mutation emits the full updated list through
 * `membersChange` so the parent (receipt detail) stays the single source of
 * truth and can re-derive item assignments.
 */
@Component({
  selector: 'app-receipt-members',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, PeoplePicker, StatusBadge],
  templateUrl: './receipt-members.html',
  styleUrl: './receipt-members.scss',
})
export class ReceiptMembers {
  private api = inject(ReceiptsApi);
  private contactsApi = inject(ContactsApi);
  private snackBar = inject(MatSnackBar);

  readonly receiptId = input.required<string>();
  readonly members = input.required<ReceiptMemberDto[]>();
  readonly canManage = input<boolean>(false);
  /** The signed-in user uploaded the receipt, so its contacts are theirs. */
  readonly canPickContacts = input<boolean>(false);

  readonly membersChange = output<ReceiptMemberDto[]>();

  /** A request is in flight — disables every action to avoid overlapping writes. */
  busy = signal(false);
  /** Id of the member whose row is showing the inline "confirm remove" prompt. */
  pendingRemovalId = signal<number | null>(null);

  /** The uploader's address book; empty for anyone else, and until it loads. */
  contacts = signal<ContactDto[]>([]);

  takenContactIds = computed(() => this.members().map(m => m.contactId));
  takenNames = computed(() => this.members().map(m => m.displayName));

  constructor() {
    effect(() => {
      if (this.canManage() && this.canPickContacts()) untracked(() => this.loadContacts());
    });
  }

  /**
   * Best-effort: without the book the picker still adds people by name.
   * Re-run after every change to the roster, which is what recency, "on your
   * last receipt" and the book itself are derived from.
   */
  private loadContacts(): void {
    if (!this.canPickContacts()) return;
    this.contactsApi.getContacts({ forReceipt: this.receiptId() }).subscribe({
      next: contacts => this.contacts.set(contacts),
      error: () => {},
    });
  }

  addContact(contact: ContactDto): void {
    this.add([{ contactId: contact.contactId }]);
  }

  addNewPerson(displayName: string): void {
    this.add([{ displayName }]);
  }

  /** "Same people as last receipt". */
  addPrevious(contacts: ContactDto[]): void {
    this.add(contacts.map(c => ({ contactId: c.contactId })));
  }

  /**
   * Adds one request after another, so a failure part-way leaves the ones
   * before it in place — and on the roster — rather than in an unknown state.
   */
  private add(requests: AddReceiptMemberRequest[]): void {
    if (requests.length === 0 || this.busy()) return;
    this.busy.set(true);

    const added: ReceiptMemberDto[] = [];
    const finish = (err?: unknown) => {
      this.busy.set(false);
      if (added.length > 0) {
        this.membersChange.emit([...this.members(), ...added]);
        this.loadContacts();
      }
      if (err !== undefined) {
        this.snackBar.open(this.errorText(err, 'Could not add member.'), 'Dismiss', {
          duration: 4000,
        });
      } else {
        const who = added.length === 1 ? added[0].displayName : `${added.length} people`;
        this.snackBar
          .open(`Added ${who}.`, 'Undo', { duration: UNDO_MS })
          .onAction()
          .subscribe(() => this.undoAdd(added));
      }
    };

    from(requests)
      .pipe(concatMap(request => this.api.addReceiptMember(this.receiptId(), request)))
      .subscribe({
        next: res => added.push(res.member),
        error: err => finish(err),
        complete: () => finish(),
      });
  }

  /** Takes back what an "Added …" toast added. */
  private undoAdd(added: ReceiptMemberDto[]): void {
    const ids = new Set(added.map(m => m.id));
    forkJoin(added.map(m => this.api.removeReceiptMember(this.receiptId(), m.id))).subscribe({
      next: () => {
        this.membersChange.emit(this.members().filter(m => !ids.has(m.id)));
        this.loadContacts();
      },
      error: err => {
        this.snackBar.open(this.errorText(err, 'Could not undo.'), 'Dismiss', { duration: 4000 });
      },
    });
  }

  roleLabel(role: ReceiptRole): string {
    return role === 'owner' ? 'Owner' : 'Editor';
  }

  changeRole(member: ReceiptMemberDto, role: ReceiptRole): void {
    if (member.role === role || this.busy()) return;
    this.busy.set(true);

    this.api.updateMemberRole(this.receiptId(), member.id, role).subscribe({
      next: res => {
        this.membersChange.emit(
          this.members().map(m => (m.id === member.id ? res.member : m)),
        );
        this.busy.set(false);
      },
      error: err => {
        this.busy.set(false);
        this.snackBar.open(this.errorText(err, 'Could not change role.'), 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  confirmRemove(member: ReceiptMemberDto): void {
    if (this.busy()) return;
    this.busy.set(true);

    this.api.removeReceiptMember(this.receiptId(), member.id).subscribe({
      next: () => {
        this.membersChange.emit(this.members().filter(m => m.id !== member.id));
        this.busy.set(false);
        this.pendingRemovalId.set(null);
        this.loadContacts();
        this.snackBar.open(`Removed ${member.displayName}.`, 'Dismiss', {
          duration: 3000,
        });
      },
      error: err => {
        this.busy.set(false);
        this.pendingRemovalId.set(null);
        this.snackBar.open(this.errorText(err, 'Could not remove member.'), 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  /** Pull the backend's `{ error }` message off a failed response, else fall back. */
  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
