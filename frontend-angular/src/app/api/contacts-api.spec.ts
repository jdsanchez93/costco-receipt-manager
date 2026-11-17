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
});
