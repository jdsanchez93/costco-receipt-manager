import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import { ContactsApi } from '../api/contacts-api';
import { ContactDetailDto, ContactDto } from '../api/types';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { Contact } from './contact';
import { MergeContactDialog } from './merge-contact-dialog';
import { RenameContactDialog } from './rename-contact-dialog';

const contact = (id: number, name: string, extra: Partial<ContactDto> = {}): ContactDto => ({
  contactId: id,
  displayName: name,
  hasAccount: false,
  receiptCount: 2,
  lastUsedAt: '2026-03-04T12:00:00',
  onPreviousReceipt: false,
  ...extra,
});

const detail = (c: ContactDto, mergeTargets: ContactDto[] = [contact(9, 'Jane')]): ContactDetailDto => ({
  contact: c,
  receipts: Array.from({ length: c.receiptCount }, (_, i) => ({
    receiptId: `r${i}`,
    createdAt: '2026-03-04T12:00:00',
    itemCount: 12,
    memberCount: 3,
  })),
  mergeTargets: c.hasAccount ? [] : mergeTargets,
});

describe('Contact', () => {
  let fixture: ComponentFixture<Contact>;
  let component: Contact;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let api: {
    getContact: ReturnType<typeof vi.fn>;
    getReview: ReturnType<typeof vi.fn>;
    deleteContact: ReturnType<typeof vi.fn>;
  };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };
  let snackSpy: { open: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;

  function setup(opts: {
    detail?: Observable<ContactDetailDto>;
    /** What the next dialog closes with. */
    closedWith?: unknown;
  } = {}): void {
    params = new BehaviorSubject(convertToParamMap({ contactId: '2' }));
    api = {
      getContact: vi.fn().mockReturnValue(opts.detail ?? of(detail(contact(2, 'John')))),
      getReview: vi.fn().mockReturnValue(of({ duplicates: [] })),
      deleteContact: vi.fn().mockReturnValue(of(void 0)),
    };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(opts.closedWith) }) };
    snackSpy = { open: vi.fn() };

    TestBed.configureTestingModule({
      imports: [Contact],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: ContactsApi, useValue: api },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Contact);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = (label: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(b => b.textContent?.includes(label)) ?? null;

  it('loads the contact named in the route', () => {
    setup();
    expect(api.getContact).toHaveBeenCalledWith(2);
    expect(text()).toContain('John');
    expect(text()).toContain("Hasn't joined");
    expect(text()).toContain('On 2 receipts you uploaded');
    expect(text()).toContain('12 items · 3 people');
  });

  it('loads again when the route moves to another contact, as a merge does', () => {
    setup();
    params.next(convertToParamMap({ contactId: '9' }));
    expect(api.getContact).toHaveBeenLastCalledWith(9);
  });

  it('offers rename and merge for a placeholder on receipts, but not delete', () => {
    setup();
    expect(button('Rename')).not.toBeNull();
    expect(button('Merge into')).not.toBeNull();
    expect(button('Delete')).toBeNull();
    expect(text()).toContain("so they can't be deleted");
  });

  it('offers delete for a placeholder on no receipts', () => {
    setup({ detail: of(detail(contact(2, 'John', { receiptCount: 0, lastUsedAt: null }))) });
    expect(button('Delete')).not.toBeNull();
    expect(text()).toContain("isn't on any receipts");
  });

  it('offers no merge when there is no one to merge into', () => {
    setup({ detail: of(detail(contact(2, 'John'), [])) });
    expect(button('Merge into')).toBeNull();
  });

  it('offers nothing to change for an account, whose name is their own', () => {
    setup({ detail: of(detail(contact(2, 'Jane Doe', { hasAccount: true }))) });
    expect(text()).toContain('Joined');
    expect(text()).toContain('only they can change it');
    expect(button('Rename')).toBeNull();
    expect(button('Merge into')).toBeNull();
    expect(button('Delete')).toBeNull();
  });

  it('says so when the contact is not in the book', () => {
    setup({ detail: throwError(() => ({ status: 404 })) });
    expect(text()).toContain("This contact isn't in your contacts.");
  });

  it('shows a rename at once', () => {
    setup({ closedWith: contact(2, 'Johnny') });
    component.rename(contact(2, 'John'));
    fixture.detectChanges();
    expect(dialogSpy.open.mock.calls[0][0]).toBe(RenameContactDialog);
    expect(text()).toContain('Johnny');
    expect(api.getReview).toHaveBeenCalled();
  });

  it('goes to the merged contact after a merge, replacing the page that is gone', () => {
    setup({ closedWith: contact(9, 'Jane') });
    const s = component.state();
    if (s.kind !== 'ok') throw new Error('not loaded');

    component.merge(s.data);

    const [type, config] = dialogSpy.open.mock.calls[0];
    expect(type).toBe(MergeContactDialog);
    expect(config.data.targets.map((t: ContactDto) => t.contactId)).toEqual([9]);
    expect(navigate).toHaveBeenCalledWith(['/app/contacts', 9], { replaceUrl: true });
    expect(snackSpy.open).toHaveBeenCalledWith('Merged John into Jane.', 'Dismiss', { duration: 4000 });
  });

  it('words a merge of two same-named contacts as one', () => {
    setup({ closedWith: contact(3, 'john ') });
    const s = component.state();
    if (s.kind !== 'ok') throw new Error('not loaded');

    component.merge(s.data);

    expect(snackSpy.open).toHaveBeenCalledWith(
      'Merged the two contacts named john.', 'Dismiss', { duration: 4000 });
  });

  it('deletes after confirming and goes back to the list', () => {
    setup({ closedWith: true });
    component.remove(contact(2, 'John', { receiptCount: 0 }));
    expect(dialogSpy.open.mock.calls[0][0]).toBe(ConfirmDialog);
    expect(api.deleteContact).toHaveBeenCalledWith(2);
    expect(navigate).toHaveBeenCalledWith(['/app/contacts'], { replaceUrl: true });
  });

  it('deletes nothing when the confirmation is cancelled', () => {
    setup({ closedWith: false });
    component.remove(contact(2, 'John', { receiptCount: 0 }));
    expect(api.deleteContact).not.toHaveBeenCalled();
  });

  it('reports a refused delete and reloads', () => {
    setup({ closedWith: true });
    api.deleteContact.mockReturnValue(throwError(() => ({ error: { error: 'John was just added to a receipt.' } })));
    api.getContact.mockClear();

    component.remove(contact(2, 'John', { receiptCount: 0 }));

    expect(snackSpy.open).toHaveBeenCalledWith('John was just added to a receipt.', 'Dismiss', { duration: 4000 });
    expect(api.getContact).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});
