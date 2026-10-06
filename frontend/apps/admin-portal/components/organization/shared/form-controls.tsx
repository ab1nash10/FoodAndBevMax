'use client';

import { Button } from '@aahar/ui';
import { ArrowLeft, Loader2, Plus, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ChangeEvent, ReactNode, TextareaHTMLAttributes } from 'react';
import { Panel } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/organization/shared/list-controls';

export function FormShell({
  backHref,
  children,
  icon,
  subtitle,
  title,
}: Readonly<{
  backHref: string;
  children: ReactNode;
  icon: LucideIcon;
  subtitle: string;
  title: string;
}>) {
  const Icon = icon;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost">
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>
      <PageHeader eyebrow="Organization" icon={Icon} subtitle={subtitle} title={title} />
      <Panel className="p-4 sm:p-5">{children}</Panel>
    </section>
  );
}

export function SubmitButton({
  disabled = false,
  isPending,
  label,
}: Readonly<{
  disabled?: boolean;
  isPending: boolean;
  label: string;
}>) {
  return (
    <Button disabled={disabled || isPending} type="submit">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function FormWarning({
  isVisible,
  message,
}: Readonly<{
  isVisible: boolean;
  message: string;
}>) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="rounded-control bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
      {message}
    </div>
  );
}

export function CheckboxLine({
  children,
  input,
}: Readonly<{
  children: ReactNode;
  input: ReactNode;
}>) {
  return (
    <label className="flex min-h-control items-center gap-3 rounded-control border border-ds-border bg-ds-surface px-3.5 text-sm font-medium text-ds-text-2">
      {input}
      {children}
    </label>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-control border border-ds-input bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text outline-hidden transition placeholder:text-ds-muted focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted',
        className,
      )}
      {...props}
    />
  );
}

export function ImageUploadField({
  error,
  id,
  label,
  onChange,
  previewUrl,
}: Readonly<{
  error?: string;
  id: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  previewUrl?: string;
}>) {
  return (
    <div className="[&>*+*]:mt-2">
      <label className="text-sm font-semibold text-ds-text" htmlFor={id}>
        {label}
      </label>
      <div className="flex flex-col gap-3 rounded-md border border-ds-border bg-white p-3 shadow-xs">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <label className="cursor-pointer" htmlFor={id}>
              Choose
            </label>
          </Button>
          <span className="text-xs text-ds-muted">JPG, PNG, or WEBP. Max 5MB.</span>
        </div>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id={id}
          onChange={onChange}
          type="file"
        />
        {previewUrl ? (
          <div
            aria-label={`${label} preview`}
            className="h-32 w-full rounded-md border border-ds-divider bg-cover bg-center"
            role="img"
            style={{ backgroundImage: `url(${previewUrl})` }}
          />
        ) : (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-ds-border bg-ds-subtle text-sm text-ds-muted">
            No image selected
          </div>
        )}
      </div>
      {error ? <p className="text-sm font-medium text-ds-status-bad-fg">{error}</p> : null}
    </div>
  );
}
