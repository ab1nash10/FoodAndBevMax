'use client';

import { Button } from '@aahar/ui';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  ChefHat,
  CookingPot,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Smartphone,
  Soup,
  Utensils,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useForm, type Path, type UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';
import { getStartPageOptions } from '@/lib/navigation';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { FieldError, Input } from '@/components/ui';
import { SegmentedControl } from '@/components/ui-controls';
import { authApi, getApiErrorMessage, userApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import { sessionUserFromAccessToken } from '@/lib/session';
import { cn } from '@/lib/utils';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const otpLength = 6;
const resendDelaySeconds = 30;

const sendOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Enter a valid 10 digit mobile number.'),
});

const verifyOtpSchema = sendOtpSchema.extend({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6 digit OTP.'),
});

const emailPasswordSchema = z.object({
  email: z.string().trim().regex(emailPattern, 'Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type LoginFormValues = {
  email: string;
  mobile: string;
  otp: string;
  password: string;
};

type LoginMethod = 'email' | 'mobile';

// What AAHAR covers, on the sign-in brand panel.
const features = [
  { icon: Soup, label: 'Fresh meals' },
  { icon: CookingPot, label: 'Cafeteria operations' },
  { icon: ChefHat, label: 'Room service' },
  { icon: Utensils, label: 'Employee food ordering' },
];

const fieldShell =
  'flex h-12 items-center overflow-hidden rounded-xl border-[1.5px] bg-ds-surface transition focus-within:border-ds-primary focus-within:ring-2 focus-within:ring-ds-primary/15 dark:focus-within:border-ds-link dark:focus-within:ring-ds-link/20';
const bareInput =
  'h-full min-w-0 flex-1 border-0 bg-transparent px-3.5 text-[15px] font-semibold text-ds-text outline-hidden placeholder:font-medium placeholder:text-ds-muted focus-visible:outline-hidden';
const fieldLabel = 'text-[13px] font-bold text-ds-text-2';

function applyValidationErrors<TFormValues extends Record<string, unknown>>(
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

function ErrorText({ children, id }: Readonly<{ children?: ReactNode; id: string }>) {
  return children ? (
    <div id={id} role="alert">
      <FieldError>{children}</FieldError>
    </div>
  ) : null;
}

/** Six one-digit boxes for the OTP: typing moves on, Backspace moves back, paste fills all. */
function OtpBoxes({
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

export default function LoginPage() {
  const router = useRouter();

  // After sign-in, open the user's chosen start page if it is one they may open. Anything
  // unexpected - no preference, a slow or failed request, a since-revoked permission - means
  // the dashboard, exactly as before Preferences existed.
  const goToStartPage = async (accessToken: string) => {
    let destination = '/dashboard';

    try {
      const preferences = await Promise.race([
        userApi.getMyPreferences().then((response) => response.data),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      const permissions = sessionUserFromAccessToken(accessToken)?.permissions ?? [];
      const hasPermission = (permission: string | string[]) =>
        (Array.isArray(permission) ? permission : [permission]).some((code) =>
          permissions.includes(code),
        );
      const startPage = preferences?.startPage;

      if (startPage && getStartPageOptions(hasPermission).some((page) => page.href === startPage)) {
        destination = startPage;
      }
    } catch {
      // The dashboard it is.
    }

    router.replace(destination);
  };
  const { isAuthenticated, isReady, signIn } = useAuth();
  const { showToast } = useToast();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [hasShownSessionNotice, setHasShownSessionNotice] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  // Errors appear on the first submit, then follow the user's typing.
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const form = useForm<LoginFormValues>({
    defaultValues: {
      email: '',
      mobile: '',
      otp: '',
      password: '',
    },
  });
  const errors = form.formState.errors;
  const activeSchema =
    loginMethod === 'email' ? emailPasswordSchema : isOtpStep ? verifyOtpSchema : sendOtpSchema;
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isReady, router]);

  useEffect(() => {
    const reason =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('reason');

    if (hasShownSessionNotice || reason !== 'session-expired') {
      return;
    }

    showToast({
      description: 'Please login again to continue.',
      title: 'Session expired',
      variant: 'info',
    });
    setHasShownSessionNotice(true);
  }, [hasShownSessionNotice, showToast]);

  useEffect(() => {
    if (!hasTriedSubmit) {
      return undefined;
    }

    const subscription = form.watch((values) => {
      const parsed = activeSchema.safeParse(values);

      if (parsed.success) {
        form.clearErrors();
      } else {
        applyValidationErrors(form, parsed.error);
      }
    });

    return () => subscription.unsubscribe();
  }, [activeSchema, form, hasTriedSubmit]);

  useEffect(() => {
    if (!isOtpStep || resendSeconds === 0) {
      return undefined;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [isOtpStep, resendSeconds]);

  const sendOtpMutation = useMutation({
    mutationFn: (body: z.output<typeof sendOtpSchema>) => authApi.sendOtp(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'OTP request failed',
        variant: 'error',
      });
    },
    onSuccess() {
      setIsOtpStep(true);
      setHasTriedSubmit(false);
      form.clearErrors();
      form.setValue('otp', '');
      setNow(Date.now());
      setResendAt(Date.now() + resendDelaySeconds * 1000);
      showToast({
        title: 'OTP sent',
        variant: 'success',
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: (body: z.output<typeof verifyOtpSchema>) => authApi.verifyOtp(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Login failed',
        variant: 'error',
      });
    },
    onSuccess(response) {
      signIn(response.data);
      showToast({
        title: 'Signed in',
        variant: 'success',
      });
      void goToStartPage(response.data.accessToken);
    },
  });

  const emailPasswordMutation = useMutation({
    mutationFn: (body: z.output<typeof emailPasswordSchema>) => authApi.loginWithPassword(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Login failed',
        variant: 'error',
      });
    },
    onSuccess(response) {
      signIn(response.data);
      showToast({
        title: 'Signed in',
        variant: 'success',
      });
      void goToStartPage(response.data.accessToken);
    },
  });

  const handleSendOtp = form.handleSubmit((values) => {
    setHasTriedSubmit(true);
    const parsed = sendOtpSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    sendOtpMutation.mutate(parsed.data);
  });

  const handleVerifyOtp = form.handleSubmit((values) => {
    setHasTriedSubmit(true);
    const parsed = verifyOtpSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    verifyOtpMutation.mutate(parsed.data);
  });

  const handleEmailPasswordLogin = form.handleSubmit((values) => {
    setHasTriedSubmit(true);
    const parsed = emailPasswordSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    emailPasswordMutation.mutate(parsed.data);
  });

  const changeLoginMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    setIsOtpStep(false);
    setHasTriedSubmit(false);
    setIsPasswordVisible(false);
    form.clearErrors();
    form.setValue('otp', '');
    form.setValue('password', '');
  };

  const isBusy =
    sendOtpMutation.isPending || verifyOtpMutation.isPending || emailPasswordMutation.isPending;
  const mobile = form.watch('mobile');
  const emailField = form.register('email');
  const passwordField = form.register('password');
  const mobileField = form.register('mobile');

  return (
    <main className="flex min-h-screen flex-wrap bg-ds-page text-ds-text">
      <section
        aria-label="About AAHAR"
        className="hidden flex-[1_1_440px] flex-col justify-between gap-10 border-r border-ds-brand-panel-border bg-ds-brand-panel px-14 py-12 text-white lg:flex"
      >
        <div>
          <div className="flex items-start justify-between gap-6">
            <span className="flex rounded-xl bg-ds-logo-chip p-3 shadow-lg shadow-black/10">
              <Image
                alt="AAHAR"
                className="h-[88px] w-auto object-contain"
                height={149}
                priority
                src={withBasePath('/brand/aahar-logo.png')}
                width={200}
              />
            </span>
            <span className="flex rounded-xl bg-ds-logo-chip px-4 py-3 shadow-lg shadow-black/10">
              <Image
                alt="Max Healthcare"
                className="h-12 w-auto"
                height={58}
                src={withBasePath('/brand/max-logo.svg')}
                width={168}
              />
            </span>
          </div>
          <div className="mt-14 flex max-w-md flex-col gap-4">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-ds-brand-panel-accent">
              Max Healthcare
            </p>
            <h1 className="text-4xl font-extrabold tracking-[-0.01em]">AAHAR</h1>
            <p className="text-lg font-semibold leading-7 text-white/90">
              Food &amp; Cafeteria Management Platform
            </p>
            <p className="max-w-sm text-sm leading-6 text-white/80">
              Hospital food operations, cafeteria service, and restaurant readiness in one calm
              workspace.
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {features.map(({ icon: Icon, label }) => (
            <li
              className="flex min-h-24 flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
              key={label}
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-ds-brand-panel-accent/10 text-ds-brand-panel-accent ring-1 ring-ds-brand-panel-accent/25">
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="text-sm font-semibold leading-5 text-white">{label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label="Sign in"
        className="flex flex-[1_1_440px] items-center justify-center px-6 py-12"
      >
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-ds-border bg-ds-logo-chip">
              <Image
                alt=""
                className="h-auto w-8"
                height={149}
                priority
                src={withBasePath('/brand/aahar-logo.png')}
                width={200}
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-extrabold tracking-[0.08em]">AAHAR</span>
              <span className="truncate text-xs text-ds-muted">
                Nourishing Health, Enhancing Lives
              </span>
            </span>
            <span className="ml-auto flex shrink-0 rounded-lg border border-ds-border bg-ds-logo-chip px-2 py-1.5">
              <Image
                alt="Max Healthcare"
                className="h-5 w-auto"
                height={58}
                src={withBasePath('/brand/max-logo.svg')}
                width={168}
              />
            </span>
          </div>

          {isOtpStep ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-extrabold">Enter the code</h2>
              <p className="text-sm text-ds-muted">
                Sent to +91 {mobile}.{' '}
                <button
                  className="font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                  disabled={isBusy}
                  onClick={() => {
                    form.setValue('otp', '');
                    form.clearErrors();
                    setHasTriedSubmit(false);
                    setIsOtpStep(false);
                  }}
                  type="button"
                >
                  Change
                </button>
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-ds-teal-text">
                  Welcome back
                </p>
                <h2 className="text-[26px] font-extrabold tracking-[-0.01em]">Sign in to AAHAR</h2>
                <p className="text-sm text-ds-muted">
                  {loginMethod === 'email'
                    ? 'Use your registered work email and password.'
                    : 'We’ll send a one-time password to your registered mobile number.'}
                </p>
              </div>
              <SegmentedControl<LoginMethod>
                className="w-full"
                label="Login method"
                onChange={changeLoginMethod}
                options={[
                  {
                    label: (
                      <>
                        <Mail aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                        Email &amp; password
                      </>
                    ),
                    value: 'email',
                  },
                  {
                    label: (
                      <>
                        <Smartphone aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                        Mobile OTP
                      </>
                    ),
                    value: 'mobile',
                  },
                ]}
                size="lg"
                value={loginMethod}
              />
            </>
          )}

          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              void (
                loginMethod === 'email'
                  ? handleEmailPasswordLogin
                  : isOtpStep
                    ? handleVerifyOtp
                    : handleSendOtp
              )(event);
            }}
          >
            {loginMethod === 'email' ? (
              <>
                <div className="flex flex-col gap-2">
                  <label className={fieldLabel} htmlFor="login-email">
                    Work email
                  </label>
                  <Input
                    aria-describedby={errors.email ? 'login-email-error' : undefined}
                    aria-invalid={errors.email ? true : undefined}
                    autoComplete="username"
                    className={cn(
                      'h-12 rounded-xl border-[1.5px] px-3.5 text-[15px] font-semibold placeholder:font-medium',
                      errors.email && 'border-ds-status-bad-fg',
                    )}
                    id="login-email"
                    placeholder="name@maxhealthcare.com"
                    type="email"
                    {...emailField}
                  />
                  <ErrorText id="login-email-error">{errors.email?.message}</ErrorText>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={fieldLabel} htmlFor="login-password">
                    Password
                  </label>
                  <span
                    className={cn(
                      fieldShell,
                      errors.password ? 'border-ds-status-bad-fg' : 'border-ds-input',
                    )}
                  >
                    <input
                      aria-describedby={errors.password ? 'login-password-error' : undefined}
                      aria-invalid={errors.password ? true : undefined}
                      autoComplete="current-password"
                      className={bareInput}
                      id="login-password"
                      placeholder="Enter your password"
                      type={isPasswordVisible ? 'text' : 'password'}
                      {...passwordField}
                    />
                    <button
                      aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                      aria-pressed={isPasswordVisible}
                      className="grid h-full w-12 shrink-0 place-items-center border-l border-ds-border bg-ds-subtle text-ds-text-2 transition hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary"
                      onClick={() => setIsPasswordVisible((current) => !current)}
                      type="button"
                    >
                      {isPasswordVisible ? (
                        <EyeOff
                          aria-hidden="true"
                          className="h-[18px] w-[18px]"
                          strokeWidth={1.8}
                        />
                      ) : (
                        <Eye aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      )}
                    </button>
                  </span>
                  <ErrorText id="login-password-error">{errors.password?.message}</ErrorText>
                </div>
              </>
            ) : isOtpStep ? (
              <fieldset className="flex flex-col gap-2">
                <legend className={cn(fieldLabel, 'pb-2')}>6-digit OTP</legend>
                <OtpBoxes
                  describedBy={errors.otp ? 'login-otp-error' : undefined}
                  invalid={Boolean(errors.otp)}
                  onChange={(value) => form.setValue('otp', value)}
                  value={form.watch('otp')}
                />
                <ErrorText id="login-otp-error">{errors.otp?.message}</ErrorText>
              </fieldset>
            ) : (
              <div className="flex flex-col gap-2">
                <label className={fieldLabel} htmlFor="login-mobile">
                  Mobile number
                </label>
                <span
                  className={cn(
                    fieldShell,
                    errors.mobile ? 'border-ds-status-bad-fg' : 'border-ds-input',
                  )}
                >
                  <span className="flex h-full items-center border-r border-ds-border bg-ds-subtle px-3 text-sm font-bold text-ds-text-2">
                    +91
                  </span>
                  <input
                    aria-describedby={errors.mobile ? 'login-mobile-error' : undefined}
                    aria-invalid={errors.mobile ? true : undefined}
                    autoComplete="tel-national"
                    className={cn(bareInput, 'px-3 font-bold tracking-[0.04em]')}
                    id="login-mobile"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="9999999999"
                    type="tel"
                    {...mobileField}
                  />
                </span>
                <ErrorText id="login-mobile-error">{errors.mobile?.message}</ErrorText>
              </div>
            )}

            <Button
              className="h-12 w-full rounded-xl text-[14.5px] font-bold"
              disabled={isBusy}
              type="submit"
            >
              {loginMethod === 'email' ? 'Sign in' : isOtpStep ? 'Verify & sign in' : 'Send OTP'}
              {isOtpStep && loginMethod === 'mobile' ? null : (
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              )}
            </Button>

            {loginMethod === 'email' ? (
              <p className="text-[12.5px] text-ds-muted">
                Forgot your password? Ask your hospital admin to reset it, or sign in with your
                mobile number instead.
              </p>
            ) : isOtpStep ? (
              <p className="text-[13px] text-ds-muted">
                Didn’t get it?{' '}
                {resendSeconds > 0 ? (
                  <span className="font-bold text-ds-text-2">
                    Resend in 0:{String(resendSeconds).padStart(2, '0')}
                  </span>
                ) : (
                  <button
                    className="font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary disabled:text-ds-muted"
                    disabled={isBusy}
                    onClick={() => sendOtpMutation.mutate({ mobile: form.getValues('mobile') })}
                    type="button"
                  >
                    Resend code
                  </button>
                )}
              </p>
            ) : (
              <p className="text-[12.5px] text-ds-muted">
                Trouble signing in? Ask your hospital admin to check that your number is registered.
              </p>
            )}
          </form>

          <p className="flex items-center gap-2 border-t border-ds-border pt-4 text-xs text-ds-muted">
            <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
            {loginMethod === 'email'
              ? 'Passwords are never shown to admins. Sessions end automatically after inactivity.'
              : 'Secured with OTP. Sessions end automatically after inactivity.'}
          </p>
        </div>
      </section>
    </main>
  );
}
