import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ProfileApi } from './profile-api';

describe('ProfileApi', () => {
  let api: ProfileApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ProfileApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getMe issues GET /api/me', () => {
    api.getMe().subscribe();

    const req = httpMock.expectOne('/api/me');
    expect(req.request.method).toBe('GET');
    req.flush({ userId: 'auth0|1', displayName: 'Ana', email: null });
  });

  it('updateMe PUTs { displayName } to /api/me', () => {
    api.updateMe('Ana').subscribe();

    const req = httpMock.expectOne('/api/me');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ displayName: 'Ana' });
    req.flush({ userId: 'auth0|1', displayName: 'Ana', email: null });
  });
});
