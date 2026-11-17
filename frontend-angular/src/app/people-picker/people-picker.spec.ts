import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { PeoplePicker } from './people-picker';
import { ContactDto } from '../api/types';

const contact = (
  contactId: number,
  displayName: string,
  extra: Partial<ContactDto> = {},
): ContactDto => ({
  contactId,
  displayName,
  hasAccount: false,
  receiptCount: 1,
  lastUsedAt: '2026-03-01T12:00:00Z',
  onPreviousReceipt: false,
  ...extra,
});

describe('PeoplePicker', () => {
  let fixture: ComponentFixture<PeoplePicker>;
  let component: PeoplePicker;

  function setup(
    opts: { contacts?: ContactDto[]; takenContactIds?: number[]; takenNames?: string[] } = {},
  ): void {
    TestBed.configureTestingModule({
      imports: [PeoplePicker],
      providers: [provideAnimationsAsync('noop')],
    }).compileComponents();

    fixture = TestBed.createComponent(PeoplePicker);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('contacts', opts.contacts ?? []);
    fixture.componentRef.setInput('takenContactIds', opts.takenContactIds ?? []);
    fixture.componentRef.setInput('takenNames', opts.takenNames ?? []);
    fixture.detectChanges();
  }

  const chips = () =>
    ([...fixture.nativeElement.querySelectorAll('.quick__chip')] as HTMLElement[]).map(c =>
      c.textContent!.trim(),
    );

  describe('before typing', () => {
    it('offers recent people as chips, most recent first, skipping anyone already on the receipt', () => {
      setup({
        contacts: [
          contact(1, 'Old', { lastUsedAt: '2026-01-01T00:00:00Z' }),
          contact(2, 'New', { lastUsedAt: '2026-03-01T00:00:00Z' }),
          contact(3, 'Here', { lastUsedAt: '2026-04-01T00:00:00Z' }),
          contact(4, 'Never', { lastUsedAt: null, receiptCount: 0 }),
        ],
        takenContactIds: [3],
      });
      expect(chips()).toEqual(['New', 'Old']);
    });

    it('emits the contact when its chip is tapped', () => {
      setup({ contacts: [contact(1, 'Jane')] });
      const picked: ContactDto[] = [];
      component.contactPicked.subscribe(c => picked.push(c));

      (fixture.nativeElement.querySelector('.quick__chip') as HTMLElement).click();
      expect(picked.map(c => c.contactId)).toEqual([1]);
    });

    it('tells two recent people with one name apart by date', () => {
      setup({
        contacts: [
          contact(1, 'John', { lastUsedAt: '2026-03-01T12:00:00Z' }),
          contact(2, 'John', { lastUsedAt: '2026-02-01T12:00:00Z' }),
        ],
      });
      expect(chips()).toEqual([
        `John · ${component.lastOn(component.recent()[0])}`,
        `John · ${component.lastOn(component.recent()[1])}`,
      ]);
    });

    it('offers "Same people as last receipt" with those not yet on this one', () => {
      setup({
        contacts: [
          contact(1, 'Jane', { onPreviousReceipt: true }),
          contact(2, 'John', { onPreviousReceipt: true }),
          contact(3, 'Joan', { onPreviousReceipt: true }),
          contact(4, 'Other'),
        ],
        takenContactIds: [3],
      });
      const copied: ContactDto[][] = [];
      component.previousPicked.subscribe(list => copied.push(list));

      const chip = fixture.nativeElement.querySelector('.quick__chip') as HTMLElement;
      expect(chip.textContent).toContain('Same people as last receipt');
      chip.click();
      expect(copied[0].map(c => c.contactId).sort()).toEqual([1, 2]);
    });

    it('leaves that out when only one person is left to copy', () => {
      setup({ contacts: [contact(1, 'Jane', { onPreviousReceipt: true })] });
      expect(chips()).toEqual(['Jane']);
    });

    it('shows no chips to someone without contacts', () => {
      setup();
      expect(fixture.nativeElement.querySelector('.quick')).toBeNull();
    });
  });

  describe('typing', () => {
    it('filters contacts, with an exact name ahead of a more recent partial match', () => {
      setup({
        contacts: [
          contact(1, 'Johnny', { lastUsedAt: '2026-04-01T00:00:00Z' }),
          contact(2, 'john', { lastUsedAt: '2026-01-01T00:00:00Z' }),
          contact(3, 'Jane'),
        ],
      });
      component.query.set(' John ');
      expect(component.matches().map(c => c.contactId)).toEqual([2, 1]);
    });

    it('ranks equally good matches by recency, then by how often they are used', () => {
      setup({
        contacts: [
          contact(1, 'Jo A', { lastUsedAt: '2026-01-01T00:00:00Z', receiptCount: 9 }),
          contact(2, 'Jo B', { lastUsedAt: '2026-02-01T00:00:00Z', receiptCount: 1 }),
          contact(3, 'Jo C', { lastUsedAt: '2026-02-01T00:00:00Z', receiptCount: 4 }),
        ],
      });
      component.query.set('jo');
      expect(component.matches().map(c => c.contactId)).toEqual([3, 2, 1]);
    });

    it('does not offer someone already on the receipt', () => {
      setup({ contacts: [contact(1, 'Jane')], takenContactIds: [1] });
      component.query.set('jane');
      expect(component.matches()).toEqual([]);
    });

    it('hides the chips', () => {
      setup({ contacts: [contact(1, 'Jane')] });
      component.query.set('j');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.quick')).toBeNull();
    });

    it('knows when the name is already taken, in the book or on the receipt', () => {
      setup({ contacts: [contact(1, 'John Doe')], takenNames: ['Alice'] });
      component.query.set('john doe');
      expect(component.nameExists()).toBe(true);
      component.query.set('ALICE');
      expect(component.nameExists()).toBe(true);
      component.query.set('John');
      expect(component.nameExists()).toBe(false);
    });
  });

  describe('choose', () => {
    it('emits a contact, or the trimmed new name, and clears the field', () => {
      setup({ contacts: [contact(1, 'Jane')] });
      const picked: ContactDto[] = [];
      const names: string[] = [];
      component.contactPicked.subscribe(c => picked.push(c));
      component.newPerson.subscribe(n => names.push(n));
      const box = fixture.nativeElement.querySelector('input') as HTMLInputElement;

      box.value = 'ja';
      component.query.set('ja');
      component.choose(component.matches()[0], box);
      expect(picked.map(c => c.contactId)).toEqual([1]);
      expect(box.value).toBe('');
      expect(component.query()).toBe('');

      component.query.set('  Bob  ');
      component.choose(component.newName(), box);
      expect(names).toEqual(['Bob']);
    });
  });

  it('takes initials from the first and last word', () => {
    setup();
    expect(component.initials('john')).toBe('J');
    expect(component.initials('John van Doe')).toBe('JD');
    expect(component.initials('  ')).toBe('');
  });
});
