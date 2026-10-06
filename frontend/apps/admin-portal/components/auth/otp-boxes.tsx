'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { FieldError } from '@/components/ui';
import { cn } from '@/lib/utils';
import { otpLength } from '@/components/auth/login-form';

export function ErrorText({ children, id }: Readonly<{ children?: ReactNode; id: string }>) {
  return children ? (
    <div id={id} role="alert">
      <FieldError>{children}</FieldError>
    </div>
  ) : null;
}

/** Six one-digit boxes for the OTP: typing moves on, Backspace moves back, paste fills all. */
export function OtpBoxes({
  describedBy,
  invalid,
  onChange,
  value,
}: Readonly<{
  describedBy?: string;
  invalid: boolean;
  onChange: (value: string) => void;
  value: string;
}>) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: otpLength }, (_, index) => value[index] ?? '');

  function fillFrom(start: number, typed: string) {
    const incoming = typed.replace(/\D/g, '');

    if (!incoming) {
      return;
    }

    const next = digits.slice();
    incoming
      .slice(0, otpLength - start)
      .split('')
      .forEach((digit, offset) => {
        next[start + offset] = digit;
      });
    onChange(next.join(''));
    boxes.current[Math.min(start + incoming.length, otpLength - 1)]?.focus();
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const next = digits.slice();
      next[index - 1] = '';
      onChange(next.join(''));
      boxes.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      boxes.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < otpLength - 1) {
      event.preventDefault();
      boxes.current[index + 1]?.focus();
    }
  }

  return (
    <div className="grid grid-cols-6 gap-2">
      {digits.map((digit, index) => (
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-label={`Digit ${index + 1}`}
          // The first box takes the whole code from SMS autofill.
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={index === 0}
          className={cn(
            'h-[54px] min-w-0 rounded-xl border-[1.5px] bg-ds-surface text-center text-xl font-extrabold text-ds-text outline-hidden transition focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 focus-visible:outline-hidden dark:focus:border-ds-link dark:focus:ring-ds-link/20',
            invalid ? 'border-ds-status-bad-fg' : digit ? 'border-ds-text-2' : 'border-ds-input',
          )}
          inputMode="numeric"
          key={index}
          onChange={(event) => {
            const typed = event.target.value;

            if (!typed) {
              const next = digits.slice();
              next[index] = '';
              onChange(next.join(''));
            } else {
              // Keep only the newest digit when the box already had one.
              fillFrom(index, typed.length > 1 && digit ? typed.replace(digit, '') : typed);
            }
          }}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
            event.preventDefault();
            fillFrom(index, event.clipboardData.getData('text'));
          }}
          pattern="[0-9]*"
          ref={(element) => {
            boxes.current[index] = element;
          }}
          type="text"
          value={digit}
        />
      ))}
    </div>
  );
}
