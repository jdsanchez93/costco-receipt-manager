import { Component, inject } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AsyncPipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, forkJoin } from 'rxjs';
import { map, shareReplay, take } from 'rxjs/operators';

import { ProfileApi } from '../api/profile-api';
import { MeDto } from '../api/types';
import { NameDialog, NameDialogData } from '../profile/name-dialog';
import { suggestedName } from '../profile/suggested-name';

@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    AsyncPipe,
  ]
})
export class ShellComponent {
  private breakpointObserver = inject(BreakpointObserver);
  private auth = inject(AuthService);
  private router = inject(Router);
  private profileApi = inject(ProfileApi);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );

  constructor() {
    this.promptForNameIfNeeded();
  }

  /**
   * When the backend couldn't get this user's name from Auth0 and fell back
   * to their sub, ask for a real one, prefilled from the ID token. Asks again
   * on every app load until a name is saved. A failed check stays quiet —
   * the profile page is where load errors show.
   *
   * Skipped when the app loads on the profile page, which already asks for
   * the same name. The initial navigation has settled by the time the
   * request returns, so `router.url` is the landing page.
   */
  private promptForNameIfNeeded(): void {
    forkJoin([this.profileApi.getMe(), this.auth.user$.pipe(take(1))]).subscribe({
      next: ([me, user]) => {
        if (!me.needsName || this.router.url.startsWith('/app/profile')) return;
        this.dialog
          .open<NameDialog, NameDialogData, MeDto>(NameDialog, {
            data: { suggestion: suggestedName(user) },
          })
          .afterClosed()
          .subscribe(saved => {
            if (saved) this.snackBar.open('Saved.', 'Dismiss', { duration: 3000 });
          });
      },
      error: () => {},
    });
  }

  /**
   * On mobile the sidenav is a modal overlay (mode="over") — collapse it
   * after the user picks a nav link. On desktop it's a static rail
   * (mode="side") and we leave it alone.
   */
  closeIfMobile(drawer: MatSidenav): void {
    if (drawer.mode === 'over') drawer.close();
  }

  logout(): void {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
