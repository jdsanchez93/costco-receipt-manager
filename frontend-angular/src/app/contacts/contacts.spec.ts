import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { ContactsApi } from '../api/contacts-api';
import { ContactDto, DuplicateContactsDto } from '../api/types';
import { Contacts } from './contacts';

const contact = (id: number, name: string, extra: Partial<ContactDto> = {}): ContactDto => ({
  contactId: id,
  displayName: name,
  hasAccount: false,
  receiptCount: 1,
  lastUsedAt: '2026-03-04T12:00:00',
  onPreviousReceipt: false,
  ...extra,
});

describe('Contacts', () => {
  let fixture: ComponentFixture<Contacts>;
  let component: Contacts;
  let api: {
    getContacts: ReturnType<typeof vi.fn>;
    getReview: ReturnType<typeof vi.fn>;
    mergeContact: ReturnType<typeof vi.fn>;
  };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };
  let snackSpy: { open: ReturnType<typeof vi.fn> };

  function setup(opts: {
    contacts?: Observable<ContactDto[]>;
    duplicates?: DuplicateContactsDto[];
    /** What the confirm dialog closes with. */
    confirm?: boolean;
  } = {}): void {
    api = {
      getContacts: vi.fn().mockReturnValue(opts.contacts ?? of([contact(1, 'Jane'), contact(2, 'John')])),
      getReview: vi.fn().mockReturnValue(of({ duplicates: opts.duplicates ?? [] })),
      mergeContact: vi.fn().mockImplementation((_from: number, into: number) => of(contact(into, 'John'))),
    };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(opts.confirm ?? true) }) };
    snackSpy = { open: vi.fn() };

    TestBed.configureTestingModule({
      imports: [Contacts],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        { provide: ContactsApi, useValue: api },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    });
    fixture = TestBed.createComponent(Contacts);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));

  it('lists the contacts with how much each is used', () => {
    setup();
    expect(component.shown().map(c => c.displayName)).toEqual(['Jane', 'John']);
    expect(text()).toContain('1 receipt · last Mar 4');
  });

  it('filters by the search text', () => {
    setup();
    component.query.set(' jan ');
    expect(component.shown().map(c => c.displayName)).toEqual(['Jane']);
  });

  it('says when the book is empty', () => {
    setup({ contacts: of([]) });
    expect(text()).toContain('No contacts yet');
  });

  it('shows the error when the book fails to load', () => {
    setup({ contacts: throwError(() => ({ error: { error: 'Nope' } })) });
    expect(text()).toContain('Nope');
  });

  it('puts duplicates under "Needs review", with merge only when they can all merge', () => {
    setup({
      duplicates: [
        { displayName: 'John', contacts: [contact(2, 'John'), contact(3, 'John')], canMergeAll: true },
        { displayName: 'Sam', contacts: [contact(5, 'Sam'), contact(6, 'Sam')], canMergeAll: false },
      ],
    });
    expect(text()).toContain('Needs review');
    expect(text()).toContain('2 contacts named John');
    expect(text()).toContain("They're on the same receipt");
    expect(buttons().filter(b => b.textContent?.includes('Merge into one'))).toHaveLength(1);
  });

  it('merges every duplicate into the most recently used one, one at a time', () => {
    const johns = [contact(2, 'John'), contact(3, 'John'), contact(4, 'John')];
    setup({ duplicates: [{ displayName: 'John', contacts: johns, canMergeAll: true }] });
    api.getContacts.mockClear();

    component.mergeAll({ displayName: 'John', contacts: johns, canMergeAll: true });

    expect(api.mergeContact.mock.calls).toEqual([[3, 2], [4, 2]]);
    expect(snackSpy.open).toHaveBeenCalledWith('Merged into one John.', 'Dismiss', { duration: 3000 });
    expect(api.getContacts).toHaveBeenCalledTimes(1);
  });

  it('merges nothing when the confirmation is cancelled', () => {
    const johns = [contact(2, 'John'), contact(3, 'John')];
    setup({ confirm: false });
    component.mergeAll({ displayName: 'John', contacts: johns, canMergeAll: true });
    expect(api.mergeContact).not.toHaveBeenCalled();
  });

  it('reports a failed merge and reloads to show what is left', () => {
    const johns = [contact(2, 'John'), contact(3, 'John')];
    setup();
    api.mergeContact.mockReturnValue(throwError(() => ({ error: { error: 'Their receipts changed while merging. Try again.' } })));
    api.getContacts.mockClear();

    component.mergeAll({ displayName: 'John', contacts: johns, canMergeAll: true });

    expect(snackSpy.open).toHaveBeenCalledWith(
      'Their receipts changed while merging. Try again.', 'Dismiss', { duration: 4000 });
    expect(api.getContacts).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(false);
  });
});
