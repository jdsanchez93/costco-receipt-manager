import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { ReceiptItems } from './receipt-items';
import { ReceiptMemberDto } from '../api/types';
import { EnrichedItem } from '../receipts/receipt-view';

const member = (id: number, displayName: string): ReceiptMemberDto => ({
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
});

const enriched = (
  id: number,
  assignedMemberIds: number[],
  assigneeNames: string[],
): EnrichedItem => ({
  id,
  receiptId: 'abc',
  itemIndex: id,
  itemNumber: null,
  itemName: `Item ${id}`,
  price: 5,
  discount: null,
  assignedMemberIds,
  assigneeNames,
  createdAt: '2026-01-01T00:00:00Z',
});

describe('ReceiptItems', () => {
  let fixture: ComponentFixture<ReceiptItems>;
  let component: ReceiptItems;

  function setup(inputs: Record<string, unknown>): void {
    TestBed.configureTestingModule({
      imports: [ReceiptItems],
      providers: [provideAnimationsAsync('noop')],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptItems);
    component = fixture.componentInstance;
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
  }

  it('read-only mode: no checkbox, no chip-remove buttons, no add menu', () => {
    setup({
      items: [enriched(1, [1], ['Alice'])],
      members: [member(1, 'Alice'), member(2, 'Bob')],
    });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-checkbox')).toBeNull();
    expect(host.querySelector('[matChipRemove]')).toBeNull();
    expect(host.querySelector('.item__assign-add')).toBeNull();
    expect(host.textContent).toContain('Alice');
  });

  it('editable mode exposes the add menu for unassigned members', () => {
    setup({
      items: [enriched(1, [1], ['Alice'])],
      members: [member(1, 'Alice'), member(2, 'Bob')],
      editable: true,
    });
    expect((fixture.nativeElement as HTMLElement).querySelector('.item__assign-add')).not.toBeNull();
    expect(component.availableMembers(component.items()[0]).map(m => m.id)).toEqual([2]);
  });

  it('selectable mode renders a checkbox and emits the id on toggle', () => {
    const toggled: number[] = [];
    setup({
      items: [enriched(1, [], [])],
      members: [member(1, 'Alice')],
      selectable: true,
      selectedIds: new Set<number>(),
    });
    component.selectionToggle.subscribe(id => toggled.push(id));

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector(
      'mat-checkbox input',
    ) as HTMLInputElement;
    checkbox.click();
    expect(toggled).toEqual([1]);
  });

  it('editable mode emits assignmentAdd with the chosen member', () => {
    const added: Array<{ item: EnrichedItem; memberId: number }> = [];
    setup({
      items: [enriched(1, [], [])],
      members: [member(1, 'Alice')],
      editable: true,
    });
    component.assignmentAdd.subscribe(e => added.push(e));

    const menuItem = (fixture.nativeElement as HTMLElement).querySelector(
      '.item__assign-add',
    ) as HTMLButtonElement;
    menuItem.click();
    fixture.detectChanges();
    const option = document.querySelector('.mat-mdc-menu-item') as HTMLButtonElement;
    option.click();

    expect(added).toEqual([{ item: component.items()[0], memberId: 1 }]);
  });
});
