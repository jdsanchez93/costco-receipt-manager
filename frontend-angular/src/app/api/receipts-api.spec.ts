import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ReceiptsApi } from './receipts-api';

describe('ReceiptsApi', () => {
  let api: ReceiptsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ReceiptsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getUserReceipts issues GET /api/receipts/user-receipts', () => {
    api.getUserReceipts().subscribe();

    const req = httpMock.expectOne('/api/receipts/user-receipts');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getReceiptItems issues GET /api/receipts/receipt/{id}/items', () => {
    api.getReceiptItems('abc123').subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/items');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getReceiptMembers issues GET /api/receipts/receipt/{id}/members', () => {
    api.getReceiptMembers('abc123').subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/members');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('URL-encodes the receiptId', () => {
    api.getReceiptItems('a b/c').subscribe();
    httpMock.expectOne('/api/receipts/receipt/a%20b%2Fc/items').flush([]);
  });
});
