import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AuthService } from '@auth0/auth0-angular';

import { Landing } from './landing';

describe('Landing', () => {
  let component: Landing;
  let fixture: ComponentFixture<Landing>;
  let authSpy: { loginWithRedirect: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authSpy = { loginWithRedirect: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: AuthService, useValue: authSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Landing);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('login() calls loginWithRedirect with appState target /app', () => {
    component.login();
    expect(authSpy.loginWithRedirect).toHaveBeenCalledWith({
      appState: { target: '/app' },
    });
  });

  it('signup() calls loginWithRedirect with appState target /app and signup screen_hint', () => {
    component.signup();
    expect(authSpy.loginWithRedirect).toHaveBeenCalledWith({
      appState: { target: '/app' },
      authorizationParams: { screen_hint: 'signup' },
    });
  });
});
