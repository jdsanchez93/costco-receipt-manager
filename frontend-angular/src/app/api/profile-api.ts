import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { MeDto } from './types';

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * The current user's profile. Backend: GET /api/me. 404 { error } if the
   * user was never provisioned.
   */
  getMe(): Observable<MeDto> {
    return this.http.get<MeDto>(`${this.base}/me`);
  }

  /**
   * Rename the current user — the name other members see on every receipt.
   * Backend: PUT /api/me with body { displayName }. 400 { error } if it's
   * blank or over 256 characters. Returns the updated profile.
   */
  updateMe(displayName: string): Observable<MeDto> {
    return this.http.put<MeDto>(`${this.base}/me`, { displayName });
  }
}
