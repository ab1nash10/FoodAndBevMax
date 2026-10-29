'use client';

import type { Path, UseFormReturn } from 'react-hook-form';

// The sign-in checks are a few patterns, so they are written out here rather than taken from zod:
// zod's runtime was about 380 KB of the sign-in page's JavaScript (a quarter of what it sends),
// and the sign-in page is the first thing every user loads. Same rules and messages as before.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const otpLength = 6;

export const resendDelaySeconds = 30;

type Field = {
  /** Applied before the check; the cleaned value is what the form sends. */
  clean?: (value: string) => string;
  message: string;
  pattern: RegExp;
};

export type ValidationIssue = { message: string; path: [string] };
export type ValidationError = { issues: ValidationIssue[] };
type ParseResult<K extends string> =
  { data: Record<K, string>; success: true } | { error: ValidationError; success: false };

/** An object of string fields: every failing field is an issue, and only its own fields are kept. */
function objectSchema<K extends string>(fields: Record<K, Field>) {
  return {
    extend<E extends string>(more: Record<E, Field>) {
      return objectSchema<K | E>({ ...fields, ...more });
    },
    safeParse(values: unknown): ParseResult<K> {
      const source = (values ?? {}) as Record<string, unknown>;
      const data = {} as Record<K, string>;
      const issues: ValidationIssue[] = [];

      for (const [name, field] of Object.entries(fields) as Array<[K, Field]>) {
        const raw = source[name];
        const value = typeof raw === 'string' ? (field.clean?.(raw) ?? raw) : undefined;

        if (value === undefined || !field.pattern.test(value)) {
          issues.push({ message: field.message, path: [name] });
        } else {
          data[name] = value;
        }
      }

      return issues.length > 0 ? { error: { issues }, success: false } : { data, success: true };
    },
  };
}

export const sendOtpSchema = objectSchema({
  mobile: { message: 'Enter a valid 10 digit mobile number.', pattern: /^\d{10}$/ },
});

const otpField: Field = { message: 'Enter the 6 digit OTP.', pattern: /^\d{6}$/ };

export const verifyOtpSchema = sendOtpSchema.extend({ otp: otpField });

// Email signs in by a one-time code sent to the work email, as mobile does by SMS.
export const sendEmailOtpSchema = objectSchema({
  email: {
    clean: (value) => value.trim().toLowerCase(),
    message: 'Enter a valid email address.',
    pattern: emailPattern,
  },
});

export const verifyEmailOtpSchema = sendEmailOtpSchema.extend({ otp: otpField });

// Email can also sign in with the password an admin set; the password goes as typed (any
// character, spaces too), so it is only required, never cleaned.
export const emailPasswordSchema = sendEmailOtpSchema.extend({
  password: { message: 'Enter your password.', pattern: /./s },
});

export type LoginFormValues = {
  email: string;
  mobile: string;
  otp: string;
  password: string;
};

export type LoginMethod = 'email' | 'mobile';

export function applyValidationErrors<TFormValues extends Record<string, unknown>>(
  form: UseFormReturn<TFormValues>,
  error: ValidationError,
) {
  form.clearErrors();

  error.issues.forEach((issue) => {
    const fieldName = issue.path[0];

    if (typeof fieldName === 'string') {
      form.setError(fieldName as Path<TFormValues>, {
        message: issue.message,
      });
    }
  });
}
