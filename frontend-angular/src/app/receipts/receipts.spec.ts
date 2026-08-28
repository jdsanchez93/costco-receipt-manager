import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { Receipts } from './receipts';
import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptMemberDto } from '../api/types';

describe('Receipts', () => {
  let fixture: ComponentFixture<Receipts>;
  let component: Receipts;

  function setup(response: Observable<ReceiptMemberDto[]>): void {
    TestBed.configureTestingModule({
      imports: [Receipts],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: { getUserReceipts: () => response } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Receipts);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('sets state to ok on successful load', () => {
    setup(of([]));
    expect(component.state().kind).toBe('ok');
  });

  it('sets state to error when the API fails', () => {
    setup(throwError(() => new Error('boom')));
    const s = component.state();
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.message).toBe('boom');
  });
});
