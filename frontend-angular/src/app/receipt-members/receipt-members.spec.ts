import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, of, throwError } from 'rxjs';

import { ReceiptMembers } from './receipt-members';
import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptMemberDto } from '../api/types';

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
  validationStatus: null,
  validatedAt: null,
  comments: null,
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
  let snackSpy: { open: ReturnType<typeof vi.fn> };
  let emitted: ReceiptMemberDto[][];

  function setup(opts: {
    members?: ReceiptMemberDto[];
    canManage?: boolean;
    addReceiptMember?: () => Observable<unknown>;
    updateMemberRole?: () => Observable<unknown>;
    removeReceiptMember?: () => Observable<unknown>;
  } = {}): void {
    apiSpy = {
      addReceiptMember: vi.fn().mockImplementation(
        () => (opts.addReceiptMember ?? (() => of({ message: 'ok', member: member(99, 'New') })))(),
      ),
      updateMemberRole: vi.fn().mockImplementation(
        () => (opts.updateMemberRole ?? (() => of({ message: 'ok', member: member(1, 'Alice', { role: 'owner' }) })))(),
      ),
      removeReceiptMember: vi.fn().mockImplementation(
        () => (opts.removeReceiptMember ?? (() => of(void 0)))(),
      ),
    };
    snackSpy = { open: vi.fn() };
    emitted = [];

    TestBed.configureTestingModule({
      imports: [ReceiptMembers],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: apiSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptMembers);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('receiptId', 'abc');
    fixture.componentRef.setInput('members', opts.members ?? []);
    fixture.componentRef.setInput('canManage', opts.canManage ?? true);
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

  describe('submitAdd', () => {
    it('POSTs the trimmed form and emits the appended roster', () => {
      setup({ members: [member(1, 'Alice')] });
      component.openForm();
      component.newName = '  Bob  ';
      component.newEmail = ' bob@example.com ';
      component.newRole = 'owner';
      component.submitAdd();

      expect(apiSpy.addReceiptMember).toHaveBeenCalledWith('abc', {
        displayName: 'Bob',
        email: 'bob@example.com',
        role: 'owner',
      });
      expect(emitted.at(-1)!.map(m => m.id)).toEqual([1, 99]);
      expect(component.formOpen()).toBe(false);
    });

    it('does nothing when the name is blank', () => {
      setup();
      component.openForm();
      component.newName = '   ';
      component.submitAdd();
      expect(apiSpy.addReceiptMember).not.toHaveBeenCalled();
    });

    it('sends email as null when omitted', () => {
      setup();
      component.openForm();
      component.newName = 'Bob';
      component.submitAdd();
      expect(apiSpy.addReceiptMember).toHaveBeenCalledWith('abc', {
        displayName: 'Bob',
        email: null,
        role: 'editor',
      });
    });

    it('surfaces the backend error message on failure', () => {
      setup({
        addReceiptMember: () => throwError(() => ({ error: { error: 'Nope' } })),
      });
      component.openForm();
      component.newName = 'Bob';
      component.submitAdd();

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
