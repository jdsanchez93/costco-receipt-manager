/** Pull the backend's `{ error }` message off a failed response, else fall back. */
export function errorText(err: unknown, fallback: string): string {
  const message = (err as { error?: { error?: unknown } })?.error?.error;
  return typeof message === 'string' && message ? message : fallback;
}
