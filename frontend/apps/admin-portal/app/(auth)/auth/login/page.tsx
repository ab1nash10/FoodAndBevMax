'use client';

import { Button } from '@aahar/ui';
import { useMutation } from '@tanstack/react-query';
import type {
  EmailPasswordLoginRequest,
  SendOtpRequest,
  VerifyOtpRequest,
} from '@aahar/api-client';
import {
  ArrowRight,
  ChefHat,
  KeyRound,
  Mail,
  Package,
  Receipt,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/auth-provider';
import { useGoHomeWhenSignedIn } from '@/components/auth/use-go-home';
import { useToast } from '@/components/toast-provider';
import { SegmentedControl } from '@/components/ui-controls';
import { authApi, getApiErrorMessage } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import {
  applyValidationErrors,
  emailPasswordSchema,
  resendDelaySeconds,
  sendEmailOtpSchema,
  sendOtpSchema,
  verifyEmailOtpSchema,
  verifyOtpSchema,
  type LoginFormValues,
  type LoginMethod,
} from '@/components/auth/login-form';
import { ErrorText, OtpBoxes } from '@/components/auth/otp-boxes';

// What AAHAR covers, on the sign-in brand panel.
const features = [
  { detail: 'Quick counters for every restaurant', icon: Receipt, label: 'Bill in seconds' },
  {
    detail: 'From delivery to plate, every batch tracked',
    icon: Package,
    label: 'Stock you can trust',
  },
  { detail: 'Productions and the TV board update live', icon: ChefHat, label: 'Kitchens in sync' },
];

const fieldShell =
  'flex h-12 items-center gap-2.5 overflow-hidden rounded-[14px] border bg-ds-subtle transition-colors duration-150 focus-within:border-ds-primary focus-within:bg-ds-surface focus-within:ring-2 focus-within:ring-ds-primary/15 dark:focus-within:border-ds-link dark:focus-within:ring-ds-link/20';

const bareInput =
  'h-full min-w-0 flex-1 border-0 bg-transparent pr-3.5 text-[15px] font-medium text-ds-text outline-hidden placeholder:font-normal placeholder:text-ds-muted focus-visible:outline-hidden';

const fieldLabel = 'text-sm font-medium text-ds-text';

// The portal goes full screen on sign-in. Browsers allow that only shortly after the user's own
// click or key press, so it is asked for as soon as sign-in succeeds; if the browser refuses
// (a very slow sign-in, or no support, e.g. iPhone Safari) sign-in carries on in the window.
function enterFullscreen() {
  const root = document.documentElement;

  if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') {
    return;
  }

  root.requestFullscreen().catch(() => undefined);
}

export default function LoginPage() {
  // Signing in here (or arriving already signed in) opens the user's start page.
  useGoHomeWhenSignedIn();
  const { signIn } = useAuth();
  const { showToast } = useToast();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [isOtpStep, setIsOtpStep] = useState(false);
  // The Email tab signs in with the password, or by a code: errors follow the last one tried.
  const [emailWay, setEmailWay] = useState<'code' | 'password'>('password');
  const [hasShownSessionNotice, setHasShownSessionNotice] = useState(false);
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
  // Mobile signs in by a one-time code; email by its password, or by a code sent to it.
  const sendSchema = loginMethod === 'email' ? sendEmailOtpSchema : sendOtpSchema;
  const verifySchema = loginMethod === 'email' ? verifyEmailOtpSchema : verifyOtpSchema;
  const activeSchema = isOtpStep
    ? verifySchema
    : loginMethod === 'email' && emailWay === 'password'
      ? emailPasswordSchema
      : sendSchema;
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    const reason =
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('reason');

    if (hasShownSessionNotice || reason !== 'session-expired') {
      return;
    }

    showToast({
      // One browser at a time: signing in elsewhere ends this browser's session too.
      description:
        'You signed in on another browser, or your session ran out. Please login again to continue.',
      title: 'Signed out',
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
    mutationFn: (body: SendOtpRequest) => authApi.sendOtp(body),
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
    mutationFn: (body: VerifyOtpRequest) => authApi.verifyOtp(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Login failed',
        variant: 'error',
      });
    },
    onSuccess(response) {
      enterFullscreen();
      signIn(response.data);
      showToast({
        title: 'Signed in',
        variant: 'success',
      });
    },
  });

  const passwordLoginMutation = useMutation({
    mutationFn: (body: EmailPasswordLoginRequest) => authApi.loginWithPassword(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Login failed',
        variant: 'error',
      });
    },
    onSuccess(response) {
      enterFullscreen();
      signIn(response.data);
      showToast({
        title: 'Signed in',
        variant: 'success',
      });
    },
  });

  const handlePasswordLogin = form.handleSubmit((values) => {
    setEmailWay('password');
    setHasTriedSubmit(true);
    const parsed = emailPasswordSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    passwordLoginMutation.mutate(parsed.data);
  });

  const handleSendOtp = form.handleSubmit((values) => {
    setEmailWay('code');
    form.clearErrors('password');
    setHasTriedSubmit(true);
    const parsed = sendSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    sendOtpMutation.mutate(parsed.data);
  });

  const handleVerifyOtp = form.handleSubmit((values) => {
    setHasTriedSubmit(true);
    const parsed = verifySchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    verifyOtpMutation.mutate(parsed.data);
  });

  const changeLoginMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    setIsOtpStep(false);
    setHasTriedSubmit(false);
    form.clearErrors();
    form.setValue('otp', '');
    form.setValue('password', '');
  };

  const isBusy =
    sendOtpMutation.isPending || verifyOtpMutation.isPending || passwordLoginMutation.isPending;
  const mobile = form.watch('mobile');
  const email = form.watch('email');
  const emailField = form.register('email');
  const mobileField = form.register('mobile');
  const passwordField = form.register('password');

  return (
    // The brand panel on the left, the form on plain white beside it.
    <main className="flex min-h-screen flex-wrap bg-ds-surface text-ds-text">
      <section
        aria-label="About AAHAR"
        className="relative isolate hidden max-w-[640px] flex-[1_1_520px] flex-col gap-8 overflow-hidden bg-[linear-gradient(150deg,#09336b_0%,#0b57a4_55%,#6e73fa_100%)] px-14 py-12 text-white lg:flex [@media(max-height:760px)]:gap-5 [@media(max-height:760px)]:py-8"
      >
        <span
          aria-hidden="true"
          className="absolute left-[300px] top-[-180px] -z-10 h-[520px] w-[520px] rounded-full bg-white/7"
        />
        <span
          aria-hidden="true"
          className="absolute left-[-160px] top-[600px] -z-10 h-[420px] w-[420px] rounded-full bg-white/6"
        />
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ds-logo-chip p-1.5">
              <Image
                alt=""
                className="h-full w-full object-contain"
                height={149}
                priority
                src={withBasePath('/brand/aahar-logo.png')}
                width={200}
              />
            </span>
            <span className="flex flex-col">
              <strong className="text-base font-semibold leading-[22px]">AAHAR</strong>
              <span className="text-xs text-white/80">Food &amp; Cafeteria</span>
            </span>
          </span>
          <span className="flex rounded-xl bg-ds-logo-chip px-3 py-2">
            <Image
              alt="Max Healthcare"
              className="h-7 w-auto"
              height={58}
              src={withBasePath('/brand/max-logo.svg')}
              width={168}
            />
          </span>
        </div>
        <div className="flex-1" />
        <h1 className="max-w-[500px] text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] xl:text-[40px]">
          Every counter, store and kitchen across Max — in one calm place.
        </h1>
        <ul className="flex flex-col gap-3.5">
          {features.map(({ detail, icon: Icon, label }) => (
            <li
              className="flex w-fit items-center gap-3.5 rounded-2xl border border-white/16 bg-white/10 py-3 pl-3.5 pr-[18px]"
              key={label}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/16">
                <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span className="flex flex-col">
                <strong className="font-medium">{label}</strong>
                <span className="text-[13px] text-white/82">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <p className="text-xs text-white/75">
          Max Healthcare · AAHAR food &amp; cafeteria management
        </p>
      </section>

      <section
        aria-label="Sign in"
        className="flex flex-[1_1_420px] items-center justify-center px-6 py-12 [@media(max-height:760px)]:py-6"
      >
        <div className="flex w-full max-w-[420px] flex-col gap-[22px]">
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
              <span className="text-[15px] font-semibold">AAHAR</span>
              <span className="truncate text-xs text-ds-muted">Food &amp; Cafeteria</span>
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
            <div className="flex flex-col gap-2">
              <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.015em]">
                Enter the code
              </h2>
              <p className="text-ds-text-2">
                Sent to {loginMethod === 'email' ? email.trim().toLowerCase() : `+91 ${mobile}`}.{' '}
                <button
                  className="font-semibold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
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
              <div className="flex flex-col gap-2">
                <h2 className="text-[28px] font-semibold leading-[34px] tracking-[-0.015em]">
                  Welcome back
                </h2>
                <p className="text-ds-text-2">
                  Sign in with the email your admin registered and your password, or with a one-time
                  code to your email or mobile.
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
                        Email
                      </>
                    ),
                    value: 'email',
                  },
                  {
                    label: (
                      <>
                        <Smartphone aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                        Mobile code
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
            className="flex flex-col gap-[22px]"
            noValidate
            onSubmit={(event) => {
              void (
                isOtpStep
                  ? handleVerifyOtp
                  : loginMethod === 'email'
                    ? handlePasswordLogin
                    : handleSendOtp
              )(event);
            }}
          >
            {isOtpStep ? (
              <fieldset className="flex flex-col gap-2">
                <legend className={cn(fieldLabel, 'pb-2')}>6-digit code</legend>
                <OtpBoxes
                  describedBy={errors.otp ? 'login-otp-error' : undefined}
                  invalid={Boolean(errors.otp)}
                  onChange={(value) => form.setValue('otp', value)}
                  value={form.watch('otp')}
                />
                <ErrorText id="login-otp-error">{errors.otp?.message}</ErrorText>
              </fieldset>
            ) : loginMethod === 'email' ? (
              <div className="flex flex-col gap-2">
                <label className={fieldLabel} htmlFor="login-email">
                  Work email
                </label>
                <span
                  className={cn(
                    fieldShell,
                    errors.email ? 'border-ds-status-bad-fg' : 'border-ds-border',
                  )}
                >
                  <Mail
                    aria-hidden="true"
                    className="ml-3.5 h-[18px] w-[18px] shrink-0 text-ds-muted"
                  />
                  <input
                    aria-describedby={errors.email ? 'login-email-error' : 'login-email-hint'}
                    aria-invalid={errors.email ? true : undefined}
                    autoComplete="email"
                    className={bareInput}
                    id="login-email"
                    placeholder="name@maxhealthcare.com"
                    // Autofill/temp-mail extensions inject attributes before hydration.
                    suppressHydrationWarning
                    type="email"
                    {...emailField}
                  />
                </span>
                {errors.email ? (
                  <ErrorText id="login-email-error">{errors.email.message}</ErrorText>
                ) : (
                  <span className="text-xs text-ds-muted" id="login-email-hint">
                    Use the address on your AAHAR profile.
                  </span>
                )}
                <label className={cn(fieldLabel, 'mt-2.5')} htmlFor="login-password">
                  Password
                </label>
                <span
                  className={cn(
                    fieldShell,
                    errors.password ? 'border-ds-status-bad-fg' : 'border-ds-border',
                  )}
                >
                  <KeyRound
                    aria-hidden="true"
                    className="ml-3.5 h-[18px] w-[18px] shrink-0 text-ds-muted"
                  />
                  <input
                    aria-describedby={errors.password ? 'login-password-error' : undefined}
                    aria-invalid={errors.password ? true : undefined}
                    autoComplete="current-password"
                    className={bareInput}
                    id="login-password"
                    placeholder="The password your admin set"
                    // Autofill/temp-mail extensions inject attributes before hydration.
                    suppressHydrationWarning
                    type="password"
                    {...passwordField}
                  />
                </span>
                <ErrorText id="login-password-error">{errors.password?.message}</ErrorText>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className={fieldLabel} htmlFor="login-mobile">
                  Mobile number
                </label>
                <span
                  className={cn(
                    fieldShell,
                    errors.mobile ? 'border-ds-status-bad-fg' : 'border-ds-border',
                  )}
                >
                  <span className="pl-3.5 font-medium text-ds-muted">+91</span>
                  <input
                    aria-describedby={errors.mobile ? 'login-mobile-error' : 'login-mobile-hint'}
                    aria-invalid={errors.mobile ? true : undefined}
                    autoComplete="tel-national"
                    className={cn(bareInput, 'tracking-[0.04em]')}
                    id="login-mobile"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit number"
                    // Autofill/temp-mail extensions inject attributes before hydration.
                    suppressHydrationWarning
                    type="tel"
                    {...mobileField}
                  />
                </span>
                {errors.mobile ? (
                  <ErrorText id="login-mobile-error">{errors.mobile.message}</ErrorText>
                ) : (
                  <span className="text-xs text-ds-muted" id="login-mobile-hint">
                    We’ll text a 6-digit code to this number.
                  </span>
                )}
              </div>
            )}

            <Button
              className="h-[50px] w-full rounded-full bg-ds-primary text-[15px] font-medium text-white shadow-[0_6px_16px_rgb(11_87_164/0.28)] hover:bg-ds-primary/90"
              disabled={isBusy}
              type="submit"
            >
              {isOtpStep ? 'Verify & sign in' : loginMethod === 'email' ? 'Sign in' : 'Send code'}
              {isOtpStep ? null : <ArrowRight aria-hidden="true" className="h-4 w-4" />}
            </Button>

            {!isOtpStep && loginMethod === 'email' ? (
              <button
                className="-mt-2 self-center text-sm font-semibold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary disabled:text-ds-muted"
                disabled={isBusy}
                onClick={(event) => void handleSendOtp(event)}
                type="button"
              >
                Email me a code instead
              </button>
            ) : null}

            {isOtpStep ? (
              <p className="text-[13px] text-ds-muted">
                Didn’t get it?{' '}
                {resendSeconds > 0 ? (
                  <span className="font-semibold text-ds-text-2">
                    Resend in 0:{String(resendSeconds).padStart(2, '0')}
                  </span>
                ) : (
                  <button
                    className="font-semibold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary disabled:text-ds-muted"
                    disabled={isBusy}
                    onClick={() =>
                      sendOtpMutation.mutate(
                        loginMethod === 'email'
                          ? { email: form.getValues('email').trim().toLowerCase() }
                          : { mobile: form.getValues('mobile') },
                      )
                    }
                    type="button"
                  >
                    Resend code
                  </button>
                )}
              </p>
            ) : null}
          </form>

          <p className="flex items-center gap-2.5 rounded-[14px] bg-ds-subtle px-3.5 py-3 text-[13px] leading-[18px] text-ds-text-2">
            <ShieldCheck
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0 text-ds-status-ok-fg"
              strokeWidth={2}
            />
            Codes expire in 5 minutes. Only people added by an admin can sign in.
          </p>
        </div>
      </section>
    </main>
  );
}
