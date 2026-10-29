import { expect, test } from 'vitest';
import {
  emailPasswordSchema,
  sendEmailOtpSchema,
  sendOtpSchema,
  verifyEmailOtpSchema,
  verifyOtpSchema,
} from './login-form';

test('mobile: exactly 10 digits, with the form message otherwise', () => {
  expect(sendOtpSchema.safeParse({ mobile: '9999999991' })).toEqual({
    data: { mobile: '9999999991' },
    success: true,
  });
  for (const mobile of ['999999999', '99999999911', '99999 99991', 'abcdefghij', '']) {
    expect(sendOtpSchema.safeParse({ mobile })).toEqual({
      error: { issues: [{ message: 'Enter a valid 10 digit mobile number.', path: ['mobile'] }] },
      success: false,
    });
  }
});

test('email: trimmed and lower-cased before the check, and sent that way', () => {
  expect(sendEmailOtpSchema.safeParse({ email: '  Jatin.Grover@MaxHealthcare.com ' })).toEqual({
    data: { email: 'jatin.grover@maxhealthcare.com' },
    success: true,
  });
  for (const email of ['jatin', 'jatin@max', '@max.com', 'a b@max.com', '']) {
    expect(sendEmailOtpSchema.safeParse({ email }).success).toBe(false);
  }
});

test('verify: the code is 6 digits, and every failing field is reported', () => {
  expect(verifyOtpSchema.safeParse({ mobile: '9999999991', otp: '000000' })).toEqual({
    data: { mobile: '9999999991', otp: '000000' },
    success: true,
  });
  expect(verifyOtpSchema.safeParse({ mobile: '12', otp: '12345' })).toEqual({
    error: {
      issues: [
        { message: 'Enter a valid 10 digit mobile number.', path: ['mobile'] },
        { message: 'Enter the 6 digit OTP.', path: ['otp'] },
      ],
    },
    success: false,
  });
  expect(verifyEmailOtpSchema.safeParse({ email: 'a@b.co', otp: '1234567' }).success).toBe(false);
});

test('only the fields of the schema are sent, and a missing field fails', () => {
  // The form holds email, mobile and otp together; mobile sign-in must not send the email.
  expect(sendOtpSchema.safeParse({ email: 'x@y.z', mobile: '9999999991', otp: '' })).toEqual({
    data: { mobile: '9999999991' },
    success: true,
  });
  expect(verifyOtpSchema.safeParse({ mobile: '9999999991' }).success).toBe(false);
  expect(sendOtpSchema.safeParse(undefined).success).toBe(false);
});

test('email and password: the email cleaned, the password sent exactly as typed', () => {
  expect(emailPasswordSchema.safeParse({ email: ' A@Max.com ', password: ' pa ss1 ' })).toEqual({
    data: { email: 'a@max.com', password: ' pa ss1 ' },
    success: true,
  });
  expect(emailPasswordSchema.safeParse({ email: 'a@max.com', password: '' })).toEqual({
    error: { issues: [{ message: 'Enter your password.', path: ['password'] }] },
    success: false,
  });
});
