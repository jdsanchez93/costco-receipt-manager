import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ProfileApi } from '../api/profile-api';
import { MeDto } from '../api/types';
import { Loadable } from '../receipts/receipt-view';

/**
 * The signed-in user's profile. Only the display name is editable — it's
 * what other members see on every receipt. The backend seeds it from the
 * Auth0 profile on first sign-in and never overwrites it after that. Email
 * is shown read-only, since it comes from the sign-in provider.
 */
@Component({
  selector: 'app-profile',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private api = inject(ProfileApi);
  private snackBar = inject(MatSnackBar);

  state = signal<Loadable<MeDto>>({ kind: 'loading' });
  /** A save is in flight. */
  busy = signal(false);

  // Form field (a plain property — only read on submit and for canSave).
  name = '';

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.getMe().subscribe({
      next: data => {
        this.name = data.displayName;
        this.state.set({ kind: 'ok', data });
      },
      error: err => this.state.set({
        kind: 'error',
        message: this.errorText(err, 'Failed to load your profile.'),
      }),
    });
  }

  /** True when the field holds a non-blank name that differs from the saved one. */
  canSave(saved: MeDto): boolean {
    const name = this.name.trim();
    return !this.busy() && name.length > 0 && name !== saved.displayName;
  }

  save(): void {
    const s = this.state();
    if (s.kind !== 'ok' || !this.canSave(s.data)) return;
    this.busy.set(true);

    this.api.updateMe(this.name.trim()).subscribe({
      next: data => {
        this.name = data.displayName;
        this.state.set({ kind: 'ok', data });
        this.busy.set(false);
        this.snackBar.open('Saved.', 'Dismiss', { duration: 3000 });
      },
      error: err => {
        this.busy.set(false);
        this.snackBar.open(this.errorText(err, 'Could not save your name.'), 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
