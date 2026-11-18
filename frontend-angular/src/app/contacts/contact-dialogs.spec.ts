import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';

import { ContactsApi } from '../api/contacts-api';
import { ContactDto } from '../api/types';
import { MergeContactDialog, MergeContactDialogData } from './merge-contact-dialog';
import { RenameContactDialog, RenameContactDialogData } from './rename-contact-dialog';

const contact = (id: number, name: string, extra: Partial<ContactDto> = {}): ContactDto => ({
  contactId: id,
  displayName: name,
  hasAccount: false,
  receiptCount: 1,
  lastUsedAt: '2026-03-04T12:00:00',
  onPreviousReceipt: false,
  ...extra,
});

// Opened through a real MatDialog, as in name-dialog.spec.ts, so
// MAT_DIALOG_DATA and MatDialogRef are real.
function configure(api: Partial<Record<keyof ContactsApi, unknown>>): HTMLElement {
  TestBed.configureTestingModule({
    providers: [provideAnimationsAsync('noop'), { provide: ContactsApi, useValue: api }],
  });
  return TestBed.inject(OverlayContainer).getContainerElement();
}

describe('RenameContactDialog', () => {
  let ref: MatDialogRef<RenameContactDialog, ContactDto>;
  let renameContact: ReturnType<typeof vi.fn>;

  function open(response: Observable<ContactDto> = of(contact(2, 'Johnny'))): void {
    renameContact = vi.fn().mockReturnValue(response);
    configure({ renameContact });
    ref = TestBed.inject(MatDialog).open<RenameContactDialog, RenameContactDialogData, ContactDto>(
      RenameContactDialog,
      { data: { contact: contact(2, 'John') } },
    );
    TestBed.tick();
  }

  it('prefills the current name, and saves only a change', () => {
    open();
    expect(ref.componentInstance.name).toBe('John');
    expect(ref.componentInstance.changed()).toBe(false);
    ref.componentInstance.name = ' John ';
    expect(ref.componentInstance.changed()).toBe(false);
  });

  it('saves the trimmed name and closes with the renamed contact', async () => {
    open();
    const closed = firstValueFrom(ref.afterClosed());
    ref.componentInstance.name = '  Johnny  ';

    ref.componentInstance.save();
    TestBed.tick();

    expect(renameContact).toHaveBeenCalledWith(2, 'Johnny');
    expect(await closed).toEqual(contact(2, 'Johnny'));
  });

  it('stays open with the error when the save fails', () => {
    open(throwError(() => ({ error: { error: 'Only Jane can change their name.' } })));
    ref.componentInstance.name = 'Johnny';

    ref.componentInstance.save();
    TestBed.tick();

    expect(ref.componentInstance.error()).toBe('Only Jane can change their name.');
    expect(ref.componentInstance.busy()).toBe(false);
    expect(ref.disableClose).toBe(false);
  });
});

describe('MergeContactDialog', () => {
  let ref: MatDialogRef<MergeContactDialog, ContactDto>;
  let overlay: HTMLElement;
  let mergeContact: ReturnType<typeof vi.fn>;

  function open(
    from: ContactDto,
    targets: ContactDto[],
    response: Observable<ContactDto> = of(targets[0]),
  ): void {
    mergeContact = vi.fn().mockReturnValue(response);
    overlay = configure({ mergeContact });
    ref = TestBed.inject(MatDialog).open<MergeContactDialog, MergeContactDialogData, ContactDto>(
      MergeContactDialog,
      { data: { contact: from, targets } },
    );
    TestBed.tick();
  }

  const targets = [contact(3, 'Jane Doe', { hasAccount: true }), contact(4, 'Priya')];

  it('lists who they can be merged into', () => {
    open(contact(2, 'John'), targets);
    const text = overlay.textContent ?? '';
    expect(text).toContain('Merge John into…');
    expect(text).toContain('Jane Doe');
    expect(text).toContain('Joined · 1 receipt');
    expect(text).toContain('Priya');
  });

  it('only searches past a handful of targets', () => {
    open(contact(2, 'John'), targets);
    expect(ref.componentInstance.searchable).toBe(false);
  });

  it('filters by the search text', () => {
    const many = Array.from({ length: 8 }, (_, i) => contact(10 + i, `Person ${i}`));
    open(contact(2, 'John'), many);
    expect(ref.componentInstance.searchable).toBe(true);
    ref.componentInstance.query.set('person 3');
    expect(ref.componentInstance.shown().map(t => t.contactId)).toEqual([13]);
  });

  it('says what moves before merging', () => {
    open(contact(2, 'John', { receiptCount: 3 }), targets);
    expect(ref.componentInstance.consequence(targets[0])).toBe(
      "John's 3 receipts will list Jane Doe instead, with the same items, and John will be " +
        "removed from your contacts. This can't be undone.");
  });

  it('words two same-named contacts as becoming one', () => {
    const other = contact(3, 'john');
    open(contact(2, 'John'), [other]);
    expect(ref.componentInstance.title(other)).toBe('Merge the two contacts named john?');
    expect(ref.componentInstance.consequence(other)).toBe(
      "This John's receipt will move to the other, with the same items, and the two will be " +
        "one contact. This can't be undone.");
  });

  it('merges into the picked contact and closes with it', async () => {
    open(contact(2, 'John'), targets);
    const closed = firstValueFrom(ref.afterClosed());

    ref.componentInstance.picked.set(targets[1]);
    ref.componentInstance.merge(targets[1]);
    TestBed.tick();

    expect(mergeContact).toHaveBeenCalledWith(2, 4);
    expect(await closed).toEqual(targets[0]);
  });

  it('stays open with the error when the merge is refused', () => {
    open(contact(2, 'John'), targets, throwError(() => ({ error: { error: "They're both on 1 receipt, so they're different people." } })));

    ref.componentInstance.picked.set(targets[1]);
    ref.componentInstance.merge(targets[1]);
    TestBed.tick();

    expect(ref.componentInstance.error()).toBe("They're both on 1 receipt, so they're different people.");
    expect(ref.componentInstance.busy()).toBe(false);
  });

  it('Back returns to the list and clears the error', () => {
    open(contact(2, 'John'), targets);
    ref.componentInstance.picked.set(targets[1]);
    ref.componentInstance.error.set('x');

    ref.componentInstance.back();

    expect(ref.componentInstance.picked()).toBeNull();
    expect(ref.componentInstance.error()).toBeNull();
  });
});
