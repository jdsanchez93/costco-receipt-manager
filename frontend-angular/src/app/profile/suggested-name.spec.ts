import { suggestedName } from './suggested-name';

describe('suggestedName', () => {
  it('prefers the name claim', () => {
    expect(suggestedName({ name: 'Ana Silva', nickname: 'ana', email: 'ana@example.com' })).toBe(
      'Ana Silva',
    );
  });

  it('skips a name that is just the email, as for email/password sign-ups', () => {
    expect(
      suggestedName({ name: 'Ana@Example.com', nickname: 'ana', email: 'ana@example.com' }),
    ).toBe('ana');
  });

  it("falls back to the email's local part", () => {
    expect(suggestedName({ email: 'ana@example.com' })).toBe('ana');
  });

  it('is empty when the token has nothing to go on', () => {
    expect(suggestedName({})).toBe('');
    expect(suggestedName(null)).toBe('');
    expect(suggestedName(undefined)).toBe('');
  });
});
