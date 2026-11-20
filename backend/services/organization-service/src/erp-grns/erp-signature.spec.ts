import { describe, expect, it } from 'vitest';
import {
  formatErpTimestamp,
  parseErpTimestamp,
  sign,
  signatureMatches,
  stringToSign,
} from './erp-signature';

// The EAM team's format: api_key|APIMethod|timestamp|token, APIMethod always GRN, as SHA-512 hex.
const text = stringToSign('erp_test_key', '20/11/2026/15/20', 'test-token-only-for-this-example');

describe('ERP request signing', () => {
  it('matches the worked example given to the ERP team', () => {
    expect(text).toBe('erp_test_key|GRN|20/11/2026/15/20|test-token-only-for-this-example');
    expect(sign(text)).toBe(
      'ef9cb5a31a4b9a181346ea66d910a9eb05f676db87ae3ec02bf22a1c9824dd0a' +
        'ceef1f02ec6dabcf496f09b293e8d01130e2e8176c47af3e4b965d26df232de2',
    );
  });

  it('gives a different signature when the key, the minute or the token changes', () => {
    const good = sign(text);
    const changed = [
      stringToSign('other_key', '20/11/2026/15/20', 'test-token-only-for-this-example'),
      stringToSign('erp_test_key', '20/11/2026/15/21', 'test-token-only-for-this-example'),
      stringToSign('erp_test_key', '20/11/2026/15/20', 'other-token'),
    ];
    for (const other of changed) expect(sign(other)).not.toBe(good);
  });

  it('compares signatures exactly, in either case, refusing anything but 128 hex', () => {
    const good = sign(text);
    expect(signatureMatches(good, good)).toBe(true);
    expect(signatureMatches(good, good.toUpperCase())).toBe(true);
    expect(signatureMatches(good, good.slice(0, 127) + (good.endsWith('0') ? '1' : '0'))).toBe(
      false,
    );
    expect(signatureMatches(good, good.slice(0, 64))).toBe(false);
    expect(signatureMatches(good, `${good.slice(0, 127)}g`)).toBe(false);
    expect(signatureMatches(good, '')).toBe(false);
  });
});

describe('ERP timestamp (dd/MM/yyyy/HH/mm, India time)', () => {
  it('reads India time', () => {
    expect(new Date(parseErpTimestamp('28/10/2026/17/40')!).toISOString()).toBe(
      '2026-10-28T12:10:00.000Z',
    );
    expect(new Date(parseErpTimestamp('01/01/2027/00/05')!).toISOString()).toBe(
      '2026-12-31T18:35:00.000Z',
    );
  });

  it.each([
    '31/02/2026/10/00',
    '28/10/2026/24/00',
    '28/10/2026/17/60',
    '00/10/2026/17/40',
    '28/13/2026/17/40',
    '28/10/2026/5/40',
    '1761630000',
    '2026-10-28T17:40',
    '',
  ])('refuses %s', (value) => {
    expect(parseErpTimestamp(value)).toBeNull();
  });

  it('writes India time in the same format', () => {
    expect(formatErpTimestamp(new Date('2026-10-28T12:10:59Z'))).toBe('28/10/2026/17/40');
    expect(formatErpTimestamp(new Date('2026-12-31T18:35:00Z'))).toBe('01/01/2027/00/05');
  });
});
