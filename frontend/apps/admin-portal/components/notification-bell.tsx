'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@aahar/api-client';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { userApi } from '@/lib/api';

const POLL_MS = 60_000;

function relativeTime(value: string): string {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;

  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const categoryStyles: Record<string, string> = {
  ACCESS: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  GRN: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  KITCHEN: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  TRANSFER: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

function NotificationRow({
  notification,
  onToggleRead,
  onNavigate,
  isPending,
}: Readonly<{
  isPending: boolean;
  notification: AppNotification;
  onNavigate: () => void;
  onToggleRead: (notification: AppNotification) => void;
}>) {
  const body = (
    <div className="flex gap-3">
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          notification.isRead ? 'bg-transparent' : 'bg-brand-teal'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm leading-5 ${
              notification.isRead
                ? 'text-slate-600 dark:text-slate-400'
                : 'font-semibold text-slate-900 dark:text-slate-100'
            }`}
          >
            {notification.title}
          </p>
          <span className="shrink-0 text-xs text-slate-400">
            {relativeTime(notification.createdAt)}
          </span>
        </div>
        {notification.body ? (
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {notification.body}
          </p>
        ) : null}
        <span
          className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            categoryStyles[notification.category] ??
            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {notification.category}
        </span>
      </div>
    </div>
  );

  // Only in-app paths: links are written server-side today, but never follow one elsewhere.
  const inAppLink =
    notification.link?.startsWith('/') && !notification.link.startsWith('//')
      ? notification.link
      : undefined;

  return (
    <li className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <div className="flex items-start gap-1 p-3 transition hover:bg-slate-50 dark:hover:bg-slate-900">
        {inAppLink ? (
          <Link className="min-w-0 flex-1" href={inAppLink} onClick={onNavigate}>
            {body}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{body}</div>
        )}
        <button
          aria-label={notification.isRead ? 'Mark as unread' : 'Mark as read'}
          className="shrink-0 rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-brand-teal disabled:opacity-50 dark:hover:bg-slate-800"
          disabled={isPending}
          onClick={() => onToggleRead(notification)}
          title={notification.isRead ? 'Mark as unread' : 'Mark as read'}
          type="button"
        >
          {notification.isRead ? '○' : '●'}
        </button>
      </div>
    </li>
  );
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Cheap poll keeps the badge live; the list is only fetched while the panel is open.
  const countQuery = useQuery({
    queryFn: async () => (await userApi.getUnreadNotificationCount()).data,
    queryKey: ['notifications', 'unread-count'],
    refetchInterval: POLL_MS,
  });

  const listQuery = useQuery({
    enabled: isOpen,
    queryFn: async () =>
      (await userApi.listNotifications({ limit: 20, unreadOnly: showUnreadOnly })).data,
    queryKey: ['notifications', 'list', showUnreadOnly],
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const toggleMutation = useMutation({
    mutationFn: (notification: AppNotification) =>
      userApi.markNotificationRead(notification.id, !notification.isRead),
    onSuccess: invalidate,
  });

  const markAllMutation = useMutation({
    mutationFn: () => userApi.markAllNotificationsRead(),
    onSuccess: invalidate,
  });

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const unreadCount = listQuery.data?.meta.unreadCount ?? countQuery.data?.unreadCount ?? 0;
  const items = listQuery.data?.items ?? [];

  return (
    <div className="relative" ref={containerRef}>
      <Button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative text-ds-text-2"
        onClick={() => setIsOpen((open) => !open)}
        size="icon"
        type="button"
        variant="outline"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-ds-stage-late px-1 text-[10px] font-bold leading-none text-white ring-2 ring-ds-surface">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </Button>

      {isOpen ? (
        <div
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-xl shadow-ds-text/10"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notifications
            </p>
            <div className="flex items-center gap-1">
              <button
                className={`rounded px-2 py-1 text-xs font-medium transition ${
                  showUnreadOnly
                    ? 'bg-brand-mint text-brand-teal'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                onClick={() => setShowUnreadOnly((only) => !only)}
                type="button"
              >
                Unread
              </button>
              <button
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
                disabled={unreadCount === 0 || markAllMutation.isPending}
                onClick={() => markAllMutation.mutate()}
                type="button"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            </div>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="grid place-items-center py-10 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-slate-500">
                  {showUnreadOnly ? 'Nothing unread.' : 'No notifications yet.'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  You will be told when a transfer needs acknowledging or your access changes.
                </p>
              </div>
            ) : (
              <ul>
                {items.map((notification) => (
                  <NotificationRow
                    isPending={toggleMutation.isPending}
                    key={notification.id}
                    notification={notification}
                    onNavigate={() => {
                      setIsOpen(false);
                      if (!notification.isRead) toggleMutation.mutate(notification);
                    }}
                    onToggleRead={(n) => toggleMutation.mutate(n)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
