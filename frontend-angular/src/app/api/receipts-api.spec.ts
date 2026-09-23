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

  it('addReceiptMember POSTs the request body to the members endpoint', () => {
    api.addReceiptMember('abc123', { displayName: 'Bob', email: null, role: 'editor' }).subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/members');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ displayName: 'Bob', email: null, role: 'editor' });
    req.flush({ message: 'ok', member: {} });
  });

  it('updateMemberRole PUTs { role } to the member role endpoint', () => {
    api.updateMemberRole('abc123', 7, 'owner').subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/members/7/role');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'owner' });
    req.flush({ message: 'ok', member: {} });
  });

  it('removeReceiptMember DELETEs the member endpoint', () => {
    api.removeReceiptMember('abc123', 7).subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/members/7');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('updateItemAssignment PUTs the member id array to the assignment endpoint', () => {
    api.updateItemAssignment('abc123', 42, [1, 2, 3]).subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/items/42/assignment');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ assignedMemberIds: [1, 2, 3] });
    req.flush(null);
  });

  it('bulkUpdateAssignments PUTs the updates array wrapped as { updates }', () => {
    const updates = [
      { itemId: 1, assignedMemberIds: [10, 20] },
      { itemId: 2, assignedMemberIds: [] },
    ];
    api.bulkUpdateAssignments('abc123', updates).subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/items/assignments/bulk');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ updates });
    req.flush(null);
  });

  it('getShares issues GET /api/receipts/receipt/{id}/shares', () => {
    api.getShares('abc123').subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/shares');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createShare POSTs { expiresInDays } to the share endpoint', () => {
    api.createShare('abc123', 30).subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/share');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ expiresInDays: 30 });
    req.flush({ shareToken: 't', shareUrl: 'u', expiresAt: '2026-01-01T00:00:00Z' });
  });

  it('deactivateShare DELETEs the share token endpoint, encoding the token', () => {
    api.deactivateShare('abc123', 'tok/en+1').subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123/shares/tok%2Fen%2B1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getSharedReceipt issues GET /api/receipts/shared/{token}, encoding the token', () => {
    api.getSharedReceipt('tok/en+1').subscribe();

    const req = httpMock.expectOne('/api/receipts/shared/tok%2Fen%2B1');
    expect(req.request.method).toBe('GET');
    req.flush({ receiptId: 'abc', items: [], members: [], shareInfo: { createdAt: '', expiresAt: '' } });
  });

  it('getUploadUrl POSTs { contentType } to the upload-url endpoint', () => {
    api.getUploadUrl('image/png').subscribe();

    const req = httpMock.expectOne('/api/receipts/get-upload-url');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ contentType: 'image/png' });
    req.flush({ receiptId: 'abc123', uploadUrl: 'https://s3/x', expiresIn: 3600 });
  });

  it('uploadToS3 PUTs the file to the given URL with a matching Content-Type header', () => {
    const file = new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });
    api.uploadToS3('https://s3.example.com/presigned', file, 'image/jpeg').subscribe();

    const req = httpMock.expectOne('https://s3.example.com/presigned');
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('Content-Type')).toBe('image/jpeg');
    expect(req.request.body).toBe(file);
    req.flush(null);
  });

  it('deleteReceipt DELETEs the receipt endpoint', () => {
    api.deleteReceipt('abc123').subscribe();

    const req = httpMock.expectOne('/api/receipts/receipt/abc123');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getDownloadUrl issues GET /api/receipts/get-download-url/{id}', () => {
    api.getDownloadUrl('abc123').subscribe();

    const req = httpMock.expectOne('/api/receipts/get-download-url/abc123');
    expect(req.request.method).toBe('GET');
    req.flush({ downloadUrl: 'https://s3/x', expiresIn: 3600 });
  });
});
