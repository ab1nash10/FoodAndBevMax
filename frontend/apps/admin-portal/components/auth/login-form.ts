'use client';

import type { Path, UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const otpLength = 6;

export const resendDelaySeconds = 30;

export const sendOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Enter a valid 10 digit mobile number.'),
});

export const verifyOtpSchema = sendOtpSchema.extend({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6 digit OTP.'),
});

export const emailPasswordSchema = z.object({
  email: z.string().trim().regex(emailPattern, 'Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
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
  error: ZodError,
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
