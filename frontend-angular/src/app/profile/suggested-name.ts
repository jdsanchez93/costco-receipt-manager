import { User } from '@auth0/auth0-angular';

/**
 * A display name to suggest from the ID token's claims. Mirrors the
 * backend's `Auth0UserProfile.DisplayName`: `name`, unless it's just the
 * email address (Auth0 email/password sign-ups set it to that), then
 * `nickname`, then the email's local part. Empty when none are present.
 */
export function suggestedName(user: User | null | undefined): string {
  const name = user?.name?.trim();
  const email = user?.email?.trim();
  if (name && name.toLowerCase() !== email?.toLowerCase()) return name;

  const nickname = user?.nickname?.trim();
  if (nickname) return nickname;

  return email ? email.split('@')[0] : '';
}
