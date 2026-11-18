import { contactMeta, initials, plural, sameName } from './contact-format';

describe('contact-format', () => {
  it('initials takes the first and last word', () => {
    expect(initials('Jane Q Doe')).toBe('JD');
    expect(initials(' jane ')).toBe('J');
  });

  it('sameName ignores case and surrounding space, like the backend', () => {
    expect(sameName(' John', 'john ')).toBe(true);
    expect(sameName('John', 'Johnny')).toBe(false);
  });

  it('plural picks the form for the count', () => {
    expect(plural(1, 'receipt')).toBe('1 receipt');
    expect(plural(3, 'receipt')).toBe('3 receipts');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });

  describe('contactMeta', () => {
    const thisYear = new Date().getFullYear();

    it('counts receipts and says when they were last on one', () => {
      const meta = contactMeta(
        { hasAccount: false, receiptCount: 2, lastUsedAt: `${thisYear}-03-04T12:00:00` },
        'en-US',
      );
      expect(meta).toBe('2 receipts · last Mar 4');
    });

    it('starts with "Joined" for an account', () => {
      const meta = contactMeta(
        { hasAccount: true, receiptCount: 1, lastUsedAt: `${thisYear}-03-04T12:00:00` },
        'en-US',
      );
      expect(meta).toBe('Joined · 1 receipt · last Mar 4');
    });

    it('says so when they are on no receipts', () => {
      expect(contactMeta({ hasAccount: false, receiptCount: 0, lastUsedAt: null }, 'en-US')).toBe(
        'Not on a receipt yet',
      );
    });
  });
});
