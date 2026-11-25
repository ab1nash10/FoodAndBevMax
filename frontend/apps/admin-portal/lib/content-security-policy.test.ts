import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './content-security-policy';

const directive = (policy: string, name: string) =>
  policy.split('; ').find((rule) => rule.startsWith(`${name} `));

describe('the portal’s content security policy', () => {
  it('runs only this origin’s scripts and inline scripts carrying the request’s nonce', () => {
    const script = directive(contentSecurityPolicy('abc123', false), 'script-src');

    expect(script).toContain("'self'");
    expect(script).toContain("'nonce-abc123'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain('razorpay');
  });

  it('keeps inline styles (the print frame), with no nonce that would switch them off', () => {
    expect(directive(contentSecurityPolicy('abc123', false), 'style-src')).toBe(
      "style-src 'self' 'unsafe-inline'",
    );
  });

  it('lets Razorpay’s checkout in on the QR order page only', () => {
    const policy = contentSecurityPolicy('abc123', true);

    expect(directive(policy, 'script-src')).toContain('https://checkout.razorpay.com');
    expect(directive(policy, 'frame-src')).toContain('https://api.razorpay.com');
    expect(directive(policy, 'connect-src')).toContain('https://lumberjack.razorpay.com');
    expect(directive(contentSecurityPolicy('abc123', false), 'frame-src')).toBeUndefined();
  });
});
