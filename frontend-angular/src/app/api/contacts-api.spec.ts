import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ContactsApi } from './contacts-api';

describe('ContactsApi', () => {
  let api: ContactsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ContactsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getContacts issues a bare GET /api/contacts by default', () => {
    api.getContacts().subscribe();

    const req = httpMock.expectOne('/api/contacts');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getContacts passes q and forReceipt as query parameters', () => {
    api.getContacts({ q: 'jo', forReceipt: 'abc' }).subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/contacts');
    expect(req.request.params.get('q')).toBe('jo');
    expect(req.request.params.get('forReceipt')).toBe('abc');
    req.flush([]);
  });

  it('getContact issues GET /api/contacts/{id}', () => {
    api.getContact(7).subscribe();

    const req = httpMock.expectOne('/api/contacts/7');
    expect(req.request.method).toBe('GET');
    req.flush({ contact: {}, receipts: [], mergeTargets: [] });
  });

  it('getReview issues GET /api/contacts/review', () => {
    api.getReview().subscribe();

    const req = httpMock.expectOne('/api/contacts/review');
    expect(req.request.method).toBe('GET');
    req.flush({ duplicates: [] });
  });

  it('renameContact PATCHes { displayName }', () => {
    api.renameContact(7, 'Jane').subscribe();

    const req = httpMock.expectOne('/api/contacts/7');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Jane' });
    req.flush({});
  });

  it('deleteContact DELETEs the contact', () => {
    api.deleteContact(7).subscribe();

    const req = httpMock.expectOne('/api/contacts/7');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('mergeContact POSTs { intoContactId } to the merge endpoint', () => {
    api.mergeContact(7, 9).subscribe();

    const req = httpMock.expectOne('/api/contacts/7/merge');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ intoContactId: 9 });
    req.flush({});
  });
});
