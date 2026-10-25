'use client';

import { Button } from '@aahar/ui';
import { CircleHelp, Power, PowerOff, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  /** The button that does it: "Deactivate", "Activate". */
  confirmLabel: string;
  /** What will happen, in a sentence or two. */
  description?: ReactNode;
  /** The picture at the top; by default a bin for "Delete …", else one for the tone. */
  icon?: LucideIcon;
  title: string;
  /** danger: red, for switching something off or removing it. */
  tone?: 'danger' | 'default';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

type Request = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * The card itself: a native modal <dialog>, so the page behind is inert, it sits above any other
 * dialog, and focus returns to what opened it. Esc and a click outside cancel. role and
 * aria-modal are set so a dialog underneath knows it is no longer on top (Modal's Esc check).
 */
function ConfirmDialog({
  onClose,
  request,
}: Readonly<{ onClose: (confirmed: boolean) => void; request: Request }>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const danger = request.tone === 'danger';
  const Icon =
    request.icon ??
    (/^delete/i.test(request.confirmLabel) ? Trash2 : danger ? TriangleAlert : CircleHelp);

  useEffect(() => {
    const dialog = ref.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  return (
    <dialog
      aria-describedby={request.description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className="m-auto w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-[26px] border-0 bg-ds-surface p-0 text-ds-text shadow-[0_32px_80px_-24px_rgb(16_24_40/0.45)] ring-1 ring-ds-text/5 backdrop:bg-ds-text/35 backdrop:backdrop-blur-[3px]"
      onCancel={(event) => {
        // Esc: answer "no" ourselves, so the request always settles.
        event.preventDefault();
        onClose(false);
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> itself, not on its content.
        if (event.target === event.currentTarget) onClose(false);
      }}
      ref={ref}
      role="dialog"
    >
      <div className="flex flex-col items-center px-7 pb-6 pt-8 text-center">
        <span
          aria-hidden="true"
          className={cn(
            'grid h-14 w-14 place-items-center rounded-full ring-8',
            danger
              ? 'bg-ds-status-bad-bg text-ds-status-bad-fg ring-ds-status-bad-bg/45'
              : 'bg-ds-primary-soft text-ds-link ring-ds-primary-soft/50',
          )}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </span>
        <h2 className="mt-5 text-[19px] font-semibold leading-snug tracking-[-0.01em]" id={titleId}>
          {request.title}
        </h2>
        {request.description ? (
          <div className="mt-2 text-sm leading-6 text-ds-text-3" id={descriptionId}>
            {request.description}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-ds-divider bg-ds-subtle-2 px-6 py-4">
        <Button
          className="h-11 w-full"
          onClick={() => onClose(false)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          autoFocus
          className={cn(
            'h-11 w-full',
            // A fixed red: the theme's red is a pale pink in dark mode, unreadable under white text.
            danger && 'bg-[#d92d20] text-white shadow-none hover:bg-[#b42318]',
          )}
          onClick={() => onClose(true)}
          type="button"
        >
          {request.confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

/**
 * One "Are you sure?" dialog for the whole portal. `await confirm({ … })` is true on the confirm
 * button and false on Cancel, Esc or a click outside.
 */
export function ConfirmProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback<Confirm>(
    (options) => new Promise((resolve) => setRequest({ ...options, resolve })),
    [],
  );
  const close = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* Rendered only while asking: an idle <dialog role="dialog"> would count as "on top". */}
      {request ? <ConfirmDialog onClose={close} request={request} /> : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);

  if (!confirm) {
    throw new Error('useConfirm needs a ConfirmProvider above it');
  }

  return confirm;
}

/**
 * The prompt for an active / inactive switch, worded the same everywhere: "Deactivate Veg Thali?"
 * with what that stops (and any extra warning), or "Activate Veg Thali?".
 */
export function confirmStatusChange(
  confirm: Confirm,
  {
    activate,
    effect,
    name,
  }: Readonly<{
    activate: boolean;
    /** What switching it off stops, or anything else the person should read first. */
    effect?: ReactNode;
    name: string;
  }>,
): Promise<boolean> {
  return activate
    ? confirm({
        confirmLabel: 'Activate',
        description: 'It becomes available again straight away.',
        icon: Power,
        title: `Activate ${name}?`,
      })
    : confirm({
        confirmLabel: 'Deactivate',
        description: effect ?? 'It stops being available until it is activated again.',
        icon: PowerOff,
        title: `Deactivate ${name}?`,
        tone: 'danger',
      });
}
