import { describe, expect, it } from 'vitest';
import {
  formatErpTimestamp,
  parseErpTimestamp,
  sign,
  signatureMatches,
  stringToSign,
} from './erp-signature';

const body = '{"grnNumber":"12344"}';
const nonce = '3f1c9a2e-7b4d-4e8a-9c1f-2a6b8d0e5f71';
const text = stringToSign('POST', '/erp/grns', '28/10/2026/17/40', nonce, Buffer.from(body));

describe('ERP request signing', () => {
  it('matches the worked example given to the ERP team', () => {
    expect(text).toBe(
      'POST\n/erp/grns\n28/10/2026/17/40\n' +
        `${nonce}\n8049395a816a5fbf3fa0ffa3c67f3c3ae52d947716dfbf6f6cf1d41b42ef64ce`,
    );
    expect(sign('test-secret', text)).toBe(
      'ee541f54cf3243b7fd852b0dec3a1a78dca2b1f2aa2f6e28f3f49ddfefb1d780',
    );
  });

  it('signs an empty body as the hash of nothing, and the method in capitals', () => {
    expect(stringToSign('get', '/erp/grns/1', 't', 'n', Buffer.alloc(0))).toBe(
      'GET\n/erp/grns/1\nt\nn\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('gives a different signature when any part or the secret changes', () => {
    const good = sign('test-secret', text);
    const changed = [
      stringToSign('POST', '/erp/grns', '28/10/2026/17/40', nonce, Buffer.from(`${body} `)),
      stringToSign('POST', '/erp/grns?x=1', '28/10/2026/17/40', nonce, Buffer.from(body)),
      stringToSign('POST', '/erp/grns', '28/10/2026/17/41', nonce, Buffer.from(body)),
      stringToSign('POST', '/erp/grns', '28/10/2026/17/40', `${nonce}0`, Buffer.from(body)),
    ];
    for (const other of changed) expect(sign('test-secret', other)).not.toBe(good);
    expect(sign('other-secret', text)).not.toBe(good);
  });

  it('compares signatures exactly, refusing anything that is not 64 lowercase hex', () => {
    const good = sign('test-secret', text);
    expect(signatureMatches(good, good)).toBe(true);
    expect(signatureMatches(good, good.toUpperCase())).toBe(false);
    expect(signatureMatches(good, good.slice(0, 63) + (good.endsWith('0') ? '1' : '0'))).toBe(
      false,
    );
    expect(signatureMatches(good, good.slice(0, 10))).toBe(false);
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
