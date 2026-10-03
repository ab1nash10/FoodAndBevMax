'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@aahar/api-client';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { userApi } from '@/lib/api';
import { canOpenPath, notificationHref } from '@/lib/navigation';

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
  ACCESS: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
  GRN: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
  KITCHEN: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
  TRANSFER: 'bg-ds-status-info-bg text-ds-status-info-fg',
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
          notification.isRead ? 'bg-transparent' : 'bg-ds-primary'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm leading-5 ${
              notification.isRead ? 'text-ds-text-3' : 'font-semibold text-ds-text'
            }`}
          >
            {notification.title}
          </p>
          <span className="shrink-0 text-xs text-ds-muted">
            {relativeTime(notification.createdAt)}
          </span>
        </div>
        {notification.body ? (
          <p className="mt-1 text-xs leading-5 text-ds-muted">{notification.body}</p>
        ) : null}
        <span
          className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            categoryStyles[notification.category] ?? 'bg-ds-divider text-ds-text-3'
          }`}
        >
          {notification.category}
        </span>
      </div>
    </div>
  );

  const { hasPermission } = useAuth();
  // In-app paths only, pointed at the record; plain text when the user may not open it.
  const href = notificationHref(notification.link, notification.entityId);
  const inAppLink = href && canOpenPath(href, hasPermission) ? href : undefined;

  return (
    <li className="border-b border-ds-divider last:border-0">
      <div className="flex items-start gap-1 p-3 transition hover:bg-ds-subtle">
        {inAppLink ? (
          <Link className="min-w-0 flex-1" href={inAppLink} onClick={onNavigate} prefetch={false}>
            {body}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{body}</div>
        )}
        <button
          aria-label={notification.isRead ? 'Mark as unread' : 'Mark as read'}
          className="shrink-0 rounded-sm p-1 text-xs text-ds-muted hover:bg-ds-divider hover:text-ds-teal-text disabled:opacity-50"
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
          className="absolute right-0 z-50 mt-2 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-xl shadow-ds-text/10"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-ds-divider px-3 py-2">
            <p className="text-sm font-semibold text-ds-text">Notifications</p>
            <div className="flex items-center gap-1">
              <button
                className={`rounded px-2 py-1 text-xs font-medium transition ${
                  showUnreadOnly
                    ? 'bg-ds-teal-soft text-ds-teal-text'
                    : 'text-ds-muted hover:bg-ds-divider'
                }`}
                onClick={() => setShowUnreadOnly((only) => !only)}
                type="button"
              >
                Unread
              </button>
              <button
                className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-ds-muted transition hover:bg-ds-divider disabled:opacity-40"
                disabled={unreadCount === 0 || markAllMutation.isPending}
                onClick={() => markAllMutation.mutate()}
                type="button"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="grid place-items-center py-10 text-ds-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-ds-muted">
                  {showUnreadOnly ? 'Nothing unread.' : 'No notifications yet.'}
                </p>
                <p className="mt-1 text-xs text-ds-muted">
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
