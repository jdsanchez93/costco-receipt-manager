import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, Subject, of, throwError } from 'rxjs';

import { ReceiptMembers } from './receipt-members';
import { ContactsApi } from '../api/contacts-api';
import { ReceiptsApi } from '../api/receipts-api';
import { ContactDto, ReceiptMemberDto } from '../api/types';

const contact = (contactId: number, displayName: string): ContactDto => ({
  contactId,
  displayName,
  hasAccount: false,
  receiptCount: 1,
  lastUsedAt: '2026-01-01T00:00:00Z',
  onPreviousReceipt: false,
});

const member = (
  id: number,
  displayName: string,
  extra: Partial<ReceiptMemberDto> = {},
): ReceiptMemberDto => ({
  id,
  receiptId: 'abc',
  contactId: id,
  userId: null,
  displayName,
  email: null,
  role: 'editor',
  addedByMemberId: null,
  addedAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
  ...extra,
});

describe('ReceiptMembers', () => {
  let fixture: ComponentFixture<ReceiptMembers>;
  let component: ReceiptMembers;
  let apiSpy: {
    addReceiptMember: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
    removeReceiptMember: ReturnType<typeof vi.fn>;
  };
  let contactsSpy: { getContacts: ReturnType<typeof vi.fn> };
  let snackSpy: { open: ReturnType<typeof vi.fn> };
  /** Fires when the test "clicks" the action on the last toast. */
  let snackAction: Subject<void>;
  let emitted: ReceiptMemberDto[][];

  function setup(opts: {
    members?: ReceiptMemberDto[];
    canManage?: boolean;
    canPickContacts?: boolean;
    contacts?: Observable<ContactDto[]>;
    addReceiptMember?: (request: unknown) => Observable<unknown>;
    updateMemberRole?: () => Observable<unknown>;
    removeReceiptMember?: () => Observable<unknown>;
  } = {}): void {
    apiSpy = {
      addReceiptMember: vi.fn().mockImplementation(
        (_id: string, request: unknown) =>
          (opts.addReceiptMember ?? (() => of({ message: 'ok', member: member(99, 'New') })))(request),
      ),
      updateMemberRole: vi.fn().mockImplementation(
        () => (opts.updateMemberRole ?? (() => of({ message: 'ok', member: member(1, 'Alice', { role: 'owner' }) })))(),
      ),
      removeReceiptMember: vi.fn().mockImplementation(
        () => (opts.removeReceiptMember ?? (() => of(void 0)))(),
      ),
    };
    contactsSpy = { getContacts: vi.fn().mockReturnValue(opts.contacts ?? of([])) };
    snackAction = new Subject<void>();
    snackSpy = { open: vi.fn().mockReturnValue({ onAction: () => snackAction }) };
    emitted = [];

    TestBed.configureTestingModule({
      imports: [ReceiptMembers],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: apiSpy },
        { provide: ContactsApi, useValue: contactsSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptMembers);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('receiptId', 'abc');
    fixture.componentRef.setInput('members', opts.members ?? []);
    fixture.componentRef.setInput('canManage', opts.canManage ?? true);
    fixture.componentRef.setInput('canPickContacts', opts.canPickContacts ?? false);
    component.membersChange.subscribe(list => emitted.push(list));
    fixture.detectChanges();
  }

  it('renders the member roster', () => {
    setup({ members: [member(1, 'Alice'), member(2, 'Bob')] });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Members (2)');
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('labels a member without an account as not having joined', () => {
    setup({ members: [member(1, 'Alice', { userId: 'auth0|1' }), member(2, 'Bob')] });
    const tags = [...fixture.nativeElement.querySelectorAll('.member app-status-badge')] as HTMLElement[];
    expect(tags.map(t => t.textContent!.trim())).toEqual(["Hasn't joined"]);
  });

  describe('the people field', () => {
    it('is hidden from someone who cannot manage members', () => {
      setup({ canManage: false, canPickContacts: true });
      expect(fixture.nativeElement.querySelector('app-people-picker')).toBeNull();
      expect(contactsSpy.getContacts).not.toHaveBeenCalled();
    });

    it("loads the uploader's contacts, asking who was on their last receipt", () => {
      setup({ canPickContacts: true, contacts: of([contact(7, 'Jane')]) });
      expect(contactsSpy.getContacts).toHaveBeenCalledWith({ forReceipt: 'abc' });
      expect(component.contacts().map(c => c.contactId)).toEqual([7]);
    });

    it('never loads contacts for a co-owner, who only adds by name', () => {
      setup({ canPickContacts: false });
      expect(fixture.nativeElement.querySelector('app-people-picker')).not.toBeNull();
      expect(contactsSpy.getContacts).not.toHaveBeenCalled();
    });

    it('still adds by name when the contacts fail to load', () => {
      setup({ canPickContacts: true, contacts: throwError(() => new Error('boom')) });
      component.addNewPerson('Bob');
      expect(apiSpy.addReceiptMember).toHaveBeenCalledWith('abc', { displayName: 'Bob' });
    });
  });

  describe('adding', () => {
    it('POSTs a picked contact by id and emits the appended roster', () => {
      setup({ members: [member(1, 'Alice')], canPickContacts: true });
      component.addContact(contact(7, 'Jane'));

      expect(apiSpy.addReceiptMember).toHaveBeenCalledWith('abc', { contactId: 7 });
      expect(emitted.at(-1)!.map(m => m.id)).toEqual([1, 99]);
      expect(component.busy()).toBe(false);
    });

    it('POSTs a new person by name', () => {
      setup();
      component.addNewPerson('Bob');
      expect(apiSpy.addReceiptMember).toHaveBeenCalledWith('abc', { displayName: 'Bob' });
    });

    it('reloads the contacts afterwards', () => {
      setup({ canPickContacts: true });
      component.addNewPerson('Bob');
      expect(contactsSpy.getContacts).toHaveBeenCalledTimes(2);
    });

    it('offers Undo, which removes the member again', () => {
      setup({ members: [member(1, 'Alice')] });
      component.addNewPerson('Bob');
      expect(snackSpy.open).toHaveBeenCalledWith('Added New.', 'Undo', expect.anything());

      fixture.componentRef.setInput('members', emitted.at(-1));
      snackAction.next();

      expect(apiSpy.removeReceiptMember).toHaveBeenCalledWith('abc', 99);
      expect(emitted.at(-1)!.map(m => m.id)).toEqual([1]);
    });

    it('adds the people from the last receipt one after another, with one Undo', () => {
      let next = 10;
      setup({
        canPickContacts: true,
        addReceiptMember: () => of({ message: 'ok', member: member(next++, 'Copied') }),
      });
      component.addPrevious([contact(7, 'Jane'), contact(8, 'John')]);

      expect(apiSpy.addReceiptMember.mock.calls.map(c => c[1])).toEqual([
        { contactId: 7 },
        { contactId: 8 },
      ]);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].map(m => m.id)).toEqual([10, 11]);
      expect(snackSpy.open).toHaveBeenCalledWith('Added 2 people.', 'Undo', expect.anything());

      fixture.componentRef.setInput('members', emitted[0]);
      snackAction.next();
      expect(apiSpy.removeReceiptMember).toHaveBeenCalledTimes(2);
      expect(emitted.at(-1)).toEqual([]);
    });

    it('keeps the ones that went through when a later one fails', () => {
      setup({
        canPickContacts: true,
        addReceiptMember: request =>
          (request as { contactId: number }).contactId === 7
            ? of({ message: 'ok', member: member(10, 'Jane') })
            : throwError(() => ({ error: { error: 'John is already on this receipt' } })),
      });
      component.addPrevious([contact(7, 'Jane'), contact(8, 'John'), contact(9, 'Joan')]);

      expect(apiSpy.addReceiptMember).toHaveBeenCalledTimes(2);
      expect(emitted.at(-1)!.map(m => m.id)).toEqual([10]);
      expect(snackSpy.open).toHaveBeenCalledWith(
        'John is already on this receipt',
        'Dismiss',
        expect.anything(),
      );
      expect(component.busy()).toBe(false);
    });

    it('surfaces the backend error message on failure', () => {
      setup({
        addReceiptMember: () => throwError(() => ({ error: { error: 'Nope' } })),
      });
      component.addNewPerson('Bob');

      expect(emitted).toHaveLength(0);
      expect(snackSpy.open).toHaveBeenCalledWith('Nope', 'Dismiss', expect.anything());
      expect(component.busy()).toBe(false);
    });
  });

  describe('changeRole', () => {
    it('PUTs the new role and emits the patched roster', () => {
      setup({ members: [member(1, 'Alice'), member(2, 'Bob')] });
      component.changeRole(member(1, 'Alice'), 'owner');

      expect(apiSpy.updateMemberRole).toHaveBeenCalledWith('abc', 1, 'owner');
      const last = emitted.at(-1)!;
      expect(last.find(m => m.id === 1)!.role).toBe('owner');
    });

    it('is a no-op when the role is unchanged', () => {
      setup();
      component.changeRole(member(1, 'Alice', { role: 'editor' }), 'editor');
      expect(apiSpy.updateMemberRole).not.toHaveBeenCalled();
    });

    it('toasts the backend message when demoting the last owner fails', () => {
      setup({
        updateMemberRole: () =>
          throwError(() => ({ error: { error: 'Cannot demote the last owner' } })),
      });
      component.changeRole(member(1, 'Alice', { role: 'owner' }), 'editor');
      expect(snackSpy.open).toHaveBeenCalledWith(
        'Cannot demote the last owner',
        'Dismiss',
        expect.anything(),
      );
    });
  });

  describe('confirmRemove', () => {
    it('DELETEs and emits the roster without the member', () => {
      setup({ members: [member(1, 'Alice'), member(2, 'Bob')] });
      component.pendingRemovalId.set(2);
      component.confirmRemove(member(2, 'Bob'));

      expect(apiSpy.removeReceiptMember).toHaveBeenCalledWith('abc', 2);
      expect(emitted.at(-1)!.map(m => m.id)).toEqual([1]);
      expect(component.pendingRemovalId()).toBeNull();
    });

    it('clears the prompt and toasts on failure', () => {
      setup({
        members: [member(1, 'Alice')],
        removeReceiptMember: () => throwError(() => ({ error: { error: 'Cannot remove the last owner' } })),
      });
      component.pendingRemovalId.set(1);
      component.confirmRemove(member(1, 'Alice'));

      expect(emitted).toHaveLength(0);
      expect(component.pendingRemovalId()).toBeNull();
      expect(snackSpy.open).toHaveBeenCalledWith(
        'Cannot remove the last owner',
        'Dismiss',
        expect.anything(),
      );
    });
  });
});
