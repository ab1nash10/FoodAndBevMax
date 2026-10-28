'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  History,
  ListOrdered,
  Loader2,
  Maximize,
  Minus,
  MonitorSmartphone,
  Plus,
  Printer,
  QrCode,
  Search,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  EmploymentType,
  FoodType,
  OnlinePaymentInput,
  OnlinePaymentProvider,
  PaymentMode,
  PosBill,
  PosBillInput,
  PosChannel,
  PosMenuItem,
} from '@aahar/api-client';
import { AppPageHeader, FoodTypeMarker } from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Input, Label, Panel, Skeleton } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { isNetworkError } from '@/lib/pos-offline-queue';
import { previewBill } from '@/lib/pos-pricing';
import { invalidatePosBillQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { useDebouncedValue } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import {
  BillTotals,
  CounterPicker,
  NoCounter,
  formatMoney,
  paymentModeLabels,
  printBill,
  printKot,
  upiPayLink,
  UpiQr,
  usePosCounter,
} from './shared';
import { OnlinePaymentDialog, providerLabels } from './online-payment-dialog';
import { onlineProvider, type CardVia } from './payment-collection';
import { ShiftChip, ShiftStartPanel } from './shift-controls';
import { PosClosed } from './pos-gate';
import { UnsentBillsButton, UnsentBillsDialog, useUnsentBills } from './unsent-bills';

interface CartLine {
  item: PosMenuItem;
  note: string;
  quantity: number;
}

const paymentModes: PaymentMode[] = ['CASH', 'UPI', 'CARD', 'OTHER'];
const paymentIcons: Record<PaymentMode, LucideIcon> = {
  CARD: CreditCard,
  CASH: Banknote,
  OTHER: Wallet,
  UPI: QrCode,
};
const allFoodTypes: FoodType[] = ['VEG', 'NON_VEG', 'EGGETARIAN'];
const foodTypeLabels: Record<FoodType, string> = {
  EGGETARIAN: 'Egg',
  NON_VEG: 'Non-veg',
  VEG: 'Veg',
};
const employmentTypeLabels: Record<EmploymentType, string> = {
  ON_ROLL: 'On roll',
  OUTSOURCED: 'Outsourced',
};
const mobilePattern = /^[6-9]\d{9}$/;

// When a kiosk order was placed, in the site's time (India), e.g. "11:42 am".
const waitingTime = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

function newClientOrderId(): string {
  return crypto.randomUUID();
}

/** Why an item cannot be added right now, or null when it can. */
function unavailableReason(item: PosMenuItem, inCart: number): string | null {
  if (item.price === null) return 'No price';
  if (!item.isAvailable) return 'Sold out';
  if (!item.isOnSale) return 'Not now';
  if (item.stock !== null && item.stock - inCart <= 0) return 'Out of stock';
  return null;
}

// The menu's "All items" tile; '' is the uncategorised items' own category (Other).
const ALL_ITEMS = '*';
// The notes and coins a guest hands over, tapped to add up what was received.
const cashNotes = [1, 2, 5, 10, 20, 50, 100, 200, 500];

/**
 * The till: pick items from the counter's menu, take the customer's details and how they paid,
 * and complete the bill. Prices, GST and stock are checked again by the server; a retry of the
 * same bill (a double tap, a dropped connection) returns the bill already made.
 */
export function BillingPageClient() {
  const { counter, counters, query: countersQuery, setCounterId } = usePosCounter();
  const { hasPermission } = useAuth();
  // Operator access: without these the till bills counter orders only, never complimentary.
  const canBillRooms = hasPermission('POS_ROOM_ORDER');
  const canApproveComplimentary = hasPermission('POS_COMPLIMENTARY_APPROVE');
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<PosChannel>('COUNTER');
  const [search, setSearch] = useState('');
  // null: the category tiles; ALL_ITEMS or a category's id: its items.
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [foodTypes, setFoodTypes] = useState<ReadonlySet<FoodType>>(() => new Set(allFoodTypes));
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef(cart);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  const [roomNumber, setRoomNumber] = useState('');
  const [bedNumber, setBedNumber] = useState('');
  const [instructions, setInstructions] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [isComplimentary, setIsComplimentary] = useState(false);
  const [complimentaryReason, setComplimentaryReason] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  // Cash the guest handed over, for the change due; never sent with the bill.
  const [cashReceived, setCashReceived] = useState(0);
  // UPI is taken on the restaurant's own QR (OWN) or online, through the provider picked here.
  const [upiVia, setUpiVia] = useState<'OWN' | OnlinePaymentProvider | null>(null);
  // A card goes to the counter's Pine Labs machine when it has one, or is keyed in by hand.
  const [cardVia, setCardVia] = useState<CardVia>('MACHINE');
  // The bill waiting for its online payment; it is made once the provider confirms.
  const [onlinePayment, setOnlinePayment] = useState<{
    payload: PosBillInput;
    request: OnlinePaymentInput;
    summary: string;
    total: number;
  } | null>(null);
  // A kiosk order loaded by its number: billing it links it, so it is never billed twice.
  const [kioskNumber, setKioskNumber] = useState('');
  const [kioskOrder, setKioskOrder] = useState<{ id: string; number: number } | null>(null);
  const upiQrRef = useRef<HTMLDivElement>(null);

  // The QR sits in the scrolling bill, above the pinned payment buttons: bring it into view
  // when UPI is picked.
  useEffect(() => {
    if (paymentMode === 'UPI') upiQrRef.current?.scrollIntoView({ block: 'nearest' });
  }, [paymentMode]);
  const [clientOrderId, setClientOrderId] = useState(newClientOrderId);
  const [completed, setCompleted] = useState<PosBill | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // The cart line whose kitchen-note box was opened ("Add note"); lines with a note keep theirs.
  const [noteOpenFor, setNoteOpenFor] = useState<number | null>(null);
  // An emptied bill (completed, cleared, cancelled) forgets it, so the next bill's first line
  // never opens a note box and takes the focus from search.
  if (cart.length === 0 && noteOpenFor !== null) setNoteOpenFor(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchMessage, setSearchMessage] = useState('');
  // The line "+", "-" and Delete act on: the item added last.
  const [lastAddedId, setLastAddedId] = useState('');
  const unsent = useUnsentBills(counter?.id);

  // Ready for the next item (typed or scanned) when the page opens and after each bill. Not on a
  // touch screen, where it would cover the menu with the keyboard.
  useEffect(() => {
    if (!completed && window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus();
  }, [completed, counter?.id]);

  const menuQuery = useQuery({
    enabled: Boolean(counter),
    queryFn: async () => (await organizationApi.getPosMenu(counter!.id, channel)).data,
    queryKey: queryKeys.posMenu(counter?.id, channel),
    refetchInterval: 60_000,
  });
  const menu = menuQuery.data?.items ?? [];
  // Kiosk orders waiting to be paid here: a guest walks up, the cashier taps their number.
  // Only where the restaurant's kiosk took orders lately (the counter says so); elsewhere a
  // number can still be looked up by hand. Every open till asked: 12-15% of all requests under load.
  const waitingQuery = useQuery({
    enabled: Boolean(counter?.kioskInUse),
    queryFn: async () => (await organizationApi.listWaitingKioskOrders(counter!.id)).data,
    queryKey: queryKeys.kioskOrderToBill('waiting', counter?.id),
    // A guest takes longer than this to walk from the kiosk.
    refetchInterval: 30_000,
  });
  const waiting = waitingQuery.data ?? [];

  // The cart follows the menu it was picked from: switching Counter / Room re-prices it at that
  // channel's prices, and a refresh carries new prices, availability and stock.
  useEffect(() => {
    const items = menuQuery.data?.items;
    if (!items) return;
    const byId = new Map(items.map((item) => [item.id, item]));
    const lines = cartRef.current;
    const kept = lines.flatMap((line) => {
      const item = byId.get(line.item.id);
      return item && item.price !== null ? [{ ...line, item }] : [];
    });

    setCart(kept);

    if (kept.length < lines.length) {
      showToast({
        description: 'They are not sold here for this order type.',
        title: `${lines.length - kept.length} item(s) taken off the bill`,
        variant: 'info',
      });
    }
  }, [menuQuery.data, showToast]);

  const quantityInCart = (menuId: string) =>
    cart.filter((line) => line.item.id === menuId).reduce((sum, line) => sum + line.quantity, 0);

  const categories = useMemo(() => {
    const counts = new Map<string, { count: number; id: string; name: string; order: number }>();

    for (const item of menu) {
      const id = item.category?.id ?? '';
      const entry = counts.get(id) ?? {
        count: 0,
        id,
        name: item.category?.categoryName ?? 'Other',
        // Uncategorised items (Other) come last.
        order: item.category?.sortOrder ?? Number.POSITIVE_INFINITY,
      };
      entry.count += 1;
      counts.set(id, entry);
    }

    // In the order set on Item Categories, so the till matches the kiosk and the menus.
    return [...counts.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [menu]);

  const term = search.trim().toLowerCase();
  // A search looks through the whole menu; otherwise the tiles show until one is opened.
  const browsing = categoryId === null && !term;
  const shown = menu.filter(
    (item) =>
      (term ||
        categoryId === null ||
        categoryId === ALL_ITEMS ||
        (item.category?.id ?? '') === categoryId) &&
      foodTypes.has(item.foodType) &&
      (!term ||
        item.itemName.toLowerCase().includes(term) ||
        item.itemCode.toLowerCase().includes(term) ||
        item.menuItemCode.toLowerCase().includes(term)),
  );

  // The Employee ID's owner and their staff discount here, looked up once typing pauses.
  const employeeLookup = useDebouncedValue(employeeCode.trim(), 400);
  const employeeQuery = useQuery({
    enabled: Boolean(counter && employeeLookup),
    queryFn: async () =>
      (await organizationApi.lookupPosEmployee(counter!.id, employeeLookup)).data,
    queryKey: queryKeys.posEmployee(counter?.id, employeeLookup),
    retry: false,
  });
  const employee = employeeLookup && employeeLookup === employeeCode.trim() ? employeeQuery : null;
  const staffDiscount = !isComplimentary ? (employee?.data?.discountPercent ?? 0) : 0;

  const totals = previewBill(
    cart.map((line) => ({
      discountPercent: line.item.isDiscountable ? staffDiscount : 0,
      gstPercent: line.item.gstPercent,
      isGstInclusive: line.item.isGstInclusive,
      quantity: line.quantity,
      unitPrice: line.item.price ?? 0,
    })),
  );
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const upiId = counter?.restaurant.upiId?.trim();
  // Asked for only once UPI is picked, so opening the till costs no extra request.
  const providersQuery = useQuery({
    enabled: paymentMode === 'UPI',
    queryFn: async () => (await organizationApi.listOnlinePaymentProviders()).data,
    queryKey: queryKeys.posPaymentProviders(),
    staleTime: Infinity,
  });
  const upiOptions: Array<'OWN' | OnlinePaymentProvider> = [
    ...(providersQuery.data ?? []),
    ...(upiId ? (['OWN'] as const) : []),
  ];
  const collectVia = upiVia && upiOptions.includes(upiVia) ? upiVia : (upiOptions[0] ?? 'OWN');
  // Like the UPI providers, asked for only once Card is picked.
  const cardMachineQuery = useQuery({
    enabled: paymentMode === 'CARD' && Boolean(counter),
    queryFn: async () => (await organizationApi.getCardMachine(counter!.id)).data,
    queryKey: ['pos-card-machine', counter?.id],
    staleTime: 5 * 60_000,
  });
  const cardMachine = cardMachineQuery.data ?? null;
  const onlineVia = onlineProvider({
    cardMachine: Boolean(cardMachine),
    cardVia,
    isComplimentary,
    paymentMode,
    upiVia: collectVia,
  });
  const collectsOnline = onlineVia !== null;
  const problems = [
    cart.length === 0 && 'Add at least one item.',
    channel === 'ROOM' && !roomNumber.trim() && 'Enter the room number.',
    customerMobile && !mobilePattern.test(customerMobile) && 'Customer mobile must be 10 digits.',
    employeeCode.trim() &&
      employee?.isError &&
      'The Employee ID matches no employee here. Correct it or clear it.',
    isComplimentary && !complimentaryReason.trim() && 'Say why the meal is complimentary.',
  ].filter((problem): problem is string => Boolean(problem));
  const takesCash = paymentMode === 'CASH' && !isComplimentary;

  function resetBill() {
    setCart([]);
    setRoomNumber('');
    setBedNumber('');
    setInstructions('');
    setCustomerMobile('');
    setEmployeeCode('');
    setIsComplimentary(false);
    setComplimentaryReason('');
    setPaymentMode('CASH');
    setPaymentReference('');
    setCashReceived(0);
    setKioskNumber('');
    setKioskOrder(null);
    setSubmitted(false);
    setClientOrderId(newClientOrderId());
  }

  // The guest's kiosk order into the bill: its items at this counter's prices, and the staff
  // member's Employee ID when they gave their mobile (check their ID card before the discount).
  const loadKiosk = useMutation({
    mutationFn: async (number: number) =>
      (await organizationApi.getKioskOrderToBill(counter!.id, number)).data,
    onError: (error) =>
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kiosk order not loaded',
        variant: 'error',
      }),
    onSuccess: (order) => {
      const byId = new Map(menu.map((item) => [item.id, item]));
      const lines = order.lines.flatMap(({ menuId, quantity }) => {
        const item = byId.get(menuId);
        return item && !unavailableReason(item, 0) ? [{ item, note: '', quantity }] : [];
      });

      setCart(lines);
      setEmployeeCode(order.employeeCode ?? '');
      setKioskOrder({ id: order.id, number: order.number });
      setKioskNumber('');
      if (lines.length < order.lines.length) {
        showToast({
          description: 'Tell the guest; the rest of their order is on the bill.',
          title: `${order.lines.length - lines.length} item(s) not available here now`,
          variant: 'info',
        });
      }
    },
  });

  function addItem(item: PosMenuItem) {
    if (unavailableReason(item, quantityInCart(item.id))) return;

    setLastAddedId(item.id);
    setCart((lines) => {
      const index = lines.findIndex((line) => line.item.id === item.id && !line.note);

      if (index === -1) return [...lines, { item, note: '', quantity: 1 }];

      return lines.map((line, at) =>
        at === index ? { ...line, quantity: line.quantity + 1 } : line,
      );
    });
  }

  function changeQuantity(index: number, delta: number) {
    setCart((lines) =>
      lines.flatMap((line, at) => {
        if (at !== index) return [line];
        const quantity = line.quantity + delta;
        if (quantity <= 0) return [];
        if (delta > 0 && unavailableReason(line.item, quantityInCart(line.item.id))) return [line];
        return [{ ...line, quantity }];
      }),
    );
  }

  /** Enter in the search box (and a barcode scanner, which types the code and Enter): the item
   * with exactly that code, else the first one shown. */
  function addFromSearch() {
    if (!term) return;
    const isCode = (item: PosMenuItem) =>
      item.itemCode.toLowerCase() === term || item.menuItemCode.toLowerCase() === term;
    const item = menu.find(isCode) ?? shown[0];
    const reason = item && unavailableReason(item, quantityInCart(item.id));

    if (!item) {
      setSearchMessage(`Nothing matches “${search.trim()}”.`);
    } else if (reason) {
      setSearchMessage(`${item.itemName}: ${reason.toLowerCase()}.`);
    } else {
      addItem(item);
      setSearch('');
      setSearchMessage('');
    }
  }

  const bill = useMutation({
    mutationFn: async ({ payload }: { payload: PosBillInput; summary: string; total: number }) =>
      (await organizationApi.createPosBill(payload)).data,
    onError: (error, queued) => {
      // No answer at all: keep the bill on this till and send it when the connection is back.
      // Its clientOrderId makes the resend safe even if this one did reach the server.
      if (isNetworkError(error) && unsent.queue(queued)) {
        resetBill();
        showToast({
          description:
            'Saved on this till; it will be sent when the connection is back. Not yet sent: no bill number, and the kitchen has not got it.',
          title: 'Bill saved, not sent',
          variant: 'info',
        });
        return;
      }

      // Same clientOrderId on the next try: if the bill was in fact made, that returns it.
      showToast({
        description: getApiErrorMessage(error),
        title: 'Bill not completed',
        variant: 'error',
      });
      void menuQuery.refetch();
    },
    onSuccess: (saved) => {
      invalidatePosBillQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.kioskOrderToBill() });
      setCompleted(saved);
      resetBill();
    },
  });

  function complete() {
    setSubmitted(true);
    if (problems.length > 0 || bill.isPending || onlinePayment) return;

    const order = {
      payload: {
        bedNumber: channel === 'ROOM' ? bedNumber.trim() || undefined : undefined,
        channel,
        clientOrderId,
        complimentaryReason: isComplimentary ? complimentaryReason.trim() : undefined,
        counterId: counter!.id,
        customerMobile: customerMobile || undefined,
        employeeCode: employeeCode.trim() || undefined,
        instructions: instructions.trim() || undefined,
        isComplimentary,
        lines: cart.map((line) => ({
          menuId: line.item.id,
          note: line.note.trim() || undefined,
          quantity: line.quantity,
        })),
        paymentMode: isComplimentary ? undefined : paymentMode,
        paymentReference: isComplimentary ? undefined : paymentReference.trim() || undefined,
        roomNumber: channel === 'ROOM' ? roomNumber.trim() : undefined,
        kioskOrderId: kioskOrder?.id,
      } satisfies PosBillInput,
      summary: cart.map((line) => `${line.quantity} × ${line.item.itemName}`).join(', '),
      total: totals.grandTotal,
    };

    if (onlineVia) {
      // The bill is made once the guest has paid, with the provider's payment on it.
      const { channel: billChannel, counterId, employeeCode: code, lines } = order.payload;
      setOnlinePayment({
        ...order,
        request: {
          channel: billChannel,
          counterId,
          employeeCode: code,
          lines,
          provider: onlineVia,
        },
      });
      return;
    }

    bill.mutate(order);
  }

  // Billing without the mouse. F2 and F9 work anywhere on the page; "/", "+", "-" and Delete
  // only outside a text field, where they would be typing. Re-bound each render for fresh state.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;

      if (event.ctrlKey || event.metaKey || event.altKey || target.closest('[role="dialog"]')) {
        return;
      }
      const typing = Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
      const index = cart.map((entry) => entry.item.id).lastIndexOf(lastAddedId);
      const line = index === -1 ? cart.length - 1 : index;

      if (event.key === 'F2' || (event.key === '/' && !typing)) {
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key === 'F9') {
        complete();
      } else if (!typing && line >= 0 && (event.key === '+' || event.key === '-')) {
        changeQuantity(line, event.key === '+' ? 1 : -1);
      } else if (!typing && line >= 0 && event.key === 'Delete') {
        changeQuantity(line, -cart[line]!.quantity);
      } else {
        return;
      }
      event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // The POS gate has already found this computer mapped to a till; the user still needs the
  // right to bill at its counter.
  const tillProblem = countersQuery.isError
    ? getApiErrorMessage(countersQuery.error)
    : countersQuery.isSuccess && counters.length === 0
      ? 'You don’t have access to this till’s counter. Ask an admin to give you access to its location.'
      : null;

  if (tillProblem) {
    return (
      <section className="space-y-4">
        <AppPageHeader title="Billing" />
        <PosClosed problem={tillProblem} />
      </section>
    );
  }

  if (!counter) {
    return (
      <section className="space-y-4">
        <AppPageHeader title="Billing" />
        <NoCounter isLoading={countersQuery.isLoading} />
      </section>
    );
  }

  // The till opens only once the cashier has started their shift at this counter.
  if (!counter.shift.open) {
    return (
      <section className="space-y-4">
        <AppPageHeader
          action={
            <div className="flex flex-wrap items-center gap-2">
              <CounterPicker
                counter={counter}
                counters={counters}
                onChange={(id) => {
                  setCounterId(id);
                  resetBill();
                }}
              />
            </div>
          }
          description="Start your shift to open the till."
          title="Billing"
        />
        <ShiftStartPanel counter={counter} key={counter.id} />
      </section>
    );
  }

  // The item's last line on the bill: the "−" on its menu card takes one off that.
  const lastLineOf = (menuId: string) => cart.map((line) => line.item.id).lastIndexOf(menuId);
  const openCategory =
    categoryId === ALL_ITEMS
      ? 'All items'
      : categories.find((category) => category.id === categoryId)?.name;
  const noteLine = noteOpenFor === null ? undefined : cart[noteOpenFor];
  const cashPending = Math.max(totals.grandTotal - cashReceived, 0);
  const cashChange = Math.max(cashReceived - totals.grandTotal, 0);

  return (
    <section className="space-y-3">
      <AppPageHeader
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ShiftChip counter={counter} />
            <UnsentBillsButton unsent={unsent} />
            {/* The browser's own full screen: no tabs or address bar on the till. Esc leaves it. */}
            <Button
              onClick={() =>
                void (document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen())
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <Maximize className="h-4 w-4" />
              Full screen
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/pos/history">
                <History className="h-4 w-4" />
                History
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/pos/orders">
                <ListOrdered className="h-4 w-4" />
                Orders
              </Link>
            </Button>
            <CounterPicker
              counter={counter}
              counters={counters}
              onChange={(id) => {
                setCounterId(id);
                resetBill();
              }}
            />
          </div>
        }
        title="Billing"
      />

      {/* One strip for what shapes the menu: order type, the room, food types and search. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card bg-ds-primary px-3 py-2.5 text-white shadow-md shadow-ds-primary/20">
        {canBillRooms ? (
          <div
            aria-label="Order type"
            className="flex rounded-control bg-white/15 p-0.5"
            role="group"
          >
            {(['COUNTER', 'ROOM'] as const).map((value) => (
              <button
                aria-pressed={channel === value}
                className={cn(
                  'h-9 rounded-control px-3.5 text-sm font-semibold transition-colors duration-150',
                  channel === value ? 'bg-white text-ds-link' : 'text-white/85 hover:text-white',
                )}
                key={value}
                onClick={() => setChannel(value)}
                type="button"
              >
                {value === 'COUNTER' ? 'Counter' : 'Room'}
              </button>
            ))}
          </div>
        ) : null}
        {channel === 'ROOM' ? (
          <div className="flex gap-2">
            <Input
              aria-label="Room number"
              className="h-9 w-32"
              id="pos-room"
              maxLength={20}
              onChange={(event) => setRoomNumber(event.target.value)}
              placeholder="Room no. *"
              value={roomNumber}
            />
            <Input
              aria-label="Bed number"
              className="h-9 w-24"
              id="pos-bed"
              maxLength={20}
              onChange={(event) => setBedNumber(event.target.value)}
              placeholder="Bed"
              value={bedNumber}
            />
          </div>
        ) : null}
        {/* Green when on, as the blue of a switch would vanish into the strip. */}
        <div
          aria-label="Food types shown"
          className="flex flex-wrap gap-4 [&_[role=switch][aria-checked=true]]:border-emerald-400 [&_[role=switch][aria-checked=true]]:bg-emerald-500 [&_[role=switch][aria-checked=true]]:bg-none"
          role="group"
        >
          {allFoodTypes.map((type) => (
            <span className="inline-flex items-center gap-2 text-sm font-semibold" key={type}>
              {foodTypeLabels[type]}
              <Toggle
                ariaLabel={`Show ${foodTypeLabels[type]}`}
                checked={foodTypes.has(type)}
                onChange={(checked) =>
                  setFoodTypes((current) => {
                    const next = new Set(current);
                    if (checked) next.add(type);
                    else next.delete(type);
                    return next;
                  })
                }
              />
            </span>
          ))}
        </div>
        <label className="relative ml-auto min-w-48 flex-1 sm:max-w-80">
          <span className="sr-only">Search the menu</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ds-muted" />
          <Input
            className="h-9 pl-9"
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchMessage('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addFromSearch();
              } else if (event.key === 'Escape') {
                setSearch('');
                setSearchMessage('');
              }
            }}
            placeholder="Search food items or code"
            ref={searchRef}
            value={search}
          />
        </label>
      </div>
      {searchMessage ? (
        <p className="text-sm text-ds-status-bad-fg" role="status">
          {searchMessage}
        </p>
      ) : null}

      {/* The menu and the bill take the whole width; the till's orders are a tap away (Orders). */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="min-w-0 bg-ds-subtle p-3">
          {menuQuery.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : menuQuery.isError ? (
            <p className="py-10 text-center text-sm text-ds-status-bad-fg">
              {getApiErrorMessage(menuQuery.error)}
            </p>
          ) : menu.length === 0 ? (
            <p className="py-10 text-center text-sm text-ds-muted">
              {`Nothing on this restaurant's menu is sold for ${channel === 'ROOM' ? 'rooms' : 'the counter'}.`}
            </p>
          ) : browsing ? (
            <ul aria-label="Categories" className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {[{ count: menu.length, id: ALL_ITEMS, name: 'All items' }, ...categories].map(
                (category) => (
                  <li key={category.id || 'other'}>
                    <button
                      className="flex h-full min-h-20 w-full items-center rounded-tile border border-ds-border bg-ds-surface p-4 text-left text-[17px] leading-snug font-bold text-ds-text shadow-xs transition-colors duration-150 hover:border-ds-primary-border hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary active:scale-[0.98]"
                      onClick={() => setCategoryId(category.id)}
                      type="button"
                    >
                      <span>
                        {category.name}{' '}
                        <span className="font-normal text-ds-muted tabular-nums">
                          ({category.count})
                        </span>
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  aria-label="Back to categories"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ds-text hover:bg-ds-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                  onClick={() => {
                    setCategoryId(null);
                    setSearch('');
                    setSearchMessage('');
                  }}
                  type="button"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg leading-snug font-bold text-ds-text">
                  {term ? `Results for “${search.trim()}”` : (openCategory ?? 'All items')}
                </h2>
              </div>
              {shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-ds-muted">No item matches.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                  {shown.map((item) => {
                    const inCart = quantityInCart(item.id);
                    const reason = unavailableReason(item, inCart);
                    const hint =
                      reason ?? (item.stock === null ? null : `${item.stock - inCart} left`);

                    return (
                      <li
                        className={cn(
                          'flex flex-col justify-between gap-3 rounded-tile border bg-ds-surface p-3 shadow-xs',
                          inCart > 0
                            ? 'border-ds-primary ring-1 ring-ds-primary ring-inset'
                            : 'border-ds-border',
                          reason && inCart === 0 && 'opacity-60',
                        )}
                        key={item.id}
                      >
                        <div className="space-y-1">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5">
                              <FoodTypeMarker type={item.foodType} />
                            </span>
                            <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug font-semibold text-ds-text">
                              {item.itemName}
                            </span>
                            <span className="shrink-0 font-mono text-[14px] font-semibold text-ds-text">
                              {item.price === null ? '—' : formatMoney(item.price)}
                            </span>
                          </div>
                          {hint ? (
                            <p
                              className={cn(
                                'truncate pl-6 text-[11.5px]',
                                reason ? 'text-ds-status-bad-fg' : 'text-ds-muted',
                              )}
                            >
                              {hint}
                            </p>
                          ) : null}
                        </div>
                        {inCart > 0 ? (
                          <div className="flex h-10 items-center justify-between rounded-control bg-ds-primary text-white">
                            <button
                              aria-label={`One less ${item.itemName}`}
                              className="grid h-full w-12 place-items-center rounded-l-control hover:bg-ds-primary-hover"
                              onClick={() => changeQuantity(lastLineOf(item.id), -1)}
                              type="button"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            {/* Keyed by the count, so each add pops it again. */}
                            <span
                              className="pop font-mono text-sm font-bold tabular-nums"
                              key={inCart}
                            >
                              {inCart}
                            </span>
                            <button
                              aria-label={`Add ${item.itemName}`}
                              className="grid h-full w-12 place-items-center rounded-r-control hover:bg-ds-primary-hover disabled:opacity-40"
                              disabled={Boolean(reason)}
                              onClick={() => addItem(item)}
                              type="button"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            aria-label={`Add ${item.itemName}`}
                            className="h-10 w-full rounded-control border border-ds-border bg-ds-surface text-sm font-bold tracking-wide text-ds-status-ok-fg transition-colors duration-150 hover:border-ds-primary-border hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary disabled:cursor-not-allowed disabled:text-ds-muted"
                            disabled={Boolean(reason)}
                            onClick={() => addItem(item)}
                            type="button"
                          >
                            ADD
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Panel>

        {/* Below lg the bill stacks under the menu: a floating bar keeps the total in view and
            takes the cashier to the bill (payment and Complete order) in one tap. */}
        {cart.length > 0 ? (
          <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-2xl bg-ds-text px-4 py-2.5 text-white shadow-2xl shadow-ds-text/30 nav:bottom-4 lg:hidden">
            <span className="min-w-0 flex-1 text-sm">
              {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
              <span className="font-mono font-semibold">{formatMoney(totals.grandTotal)}</span>
            </span>
            <Button
              className="h-10"
              onClick={() =>
                document
                  .getElementById('pos-complete')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
              type="button"
            >
              Bill &amp; pay
            </Button>
          </div>
        ) : null}
        {/* One column, top to bottom as a bill is taken; it scrolls under its pinned foot (the
            total, Cancel and Complete order), which sticks below the shell header. */}
        <Panel
          className="flex scroll-mt-[calc(var(--app-header-h)+1rem)] flex-col gap-3.5 p-4 pb-24 lg:sticky lg:top-[calc(var(--app-header-h)+1.5rem)] lg:max-h-[calc(100dvh-var(--app-header-h)-11rem)] lg:self-start lg:overflow-y-auto lg:pb-4"
          id="pos-bill"
        >
          {kioskOrder ? (
            <div className="flex items-center gap-3 rounded-control-lg bg-ds-primary-soft px-3 py-2 text-sm text-ds-text">
              <MonitorSmartphone aria-hidden="true" className="h-4 w-4 shrink-0 text-ds-link" />
              <span className="min-w-0 flex-1">
                Kiosk order <span className="font-semibold">{kioskOrder.number}</span>
                {employeeCode.trim() ? (
                  <span className="block text-xs text-ds-muted">
                    Staff discount: check their staff ID card.
                  </span>
                ) : null}
              </span>
              <Button
                className="pointer-coarse:h-11"
                onClick={() => {
                  setCart([]);
                  setEmployeeCode('');
                  setKioskOrder(null);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          ) : channel === 'COUNTER' ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const number = Number(kioskNumber);
                if (Number.isInteger(number) && number > 0) loadKiosk.mutate(number);
              }}
            >
              <Input
                aria-label="Kiosk order number"
                className="h-9 min-w-0 flex-1"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setKioskNumber(event.target.value.replace(/\D/g, ''))}
                placeholder="Kiosk order no."
                value={kioskNumber}
              />
              <Button
                className="h-9 pointer-coarse:h-11"
                disabled={!kioskNumber || loadKiosk.isPending || !menuQuery.data}
                type="submit"
                variant="outline"
              >
                <MonitorSmartphone aria-hidden="true" className="h-4 w-4" />
                Load
              </Button>
            </form>
          ) : null}

          {!kioskOrder && channel === 'COUNTER' && waiting.length > 0 ? (
            <section aria-label="Kiosk orders waiting to pay" className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-ds-muted uppercase">
                Waiting to pay · {waiting.length}
                {cart.length > 0 ? (
                  <span className="ml-1 font-normal tracking-normal normal-case">
                    (finish this bill first)
                  </span>
                ) : null}
              </p>
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {waiting.map((order) => (
                  <li key={order.id}>
                    <button
                      className="flex w-full items-center gap-3 rounded-control-lg border border-ds-border px-3 py-2 text-left transition hover:bg-ds-subtle disabled:opacity-50 pointer-coarse:min-h-11"
                      disabled={cart.length > 0 || loadKiosk.isPending || !menuQuery.data}
                      onClick={() => loadKiosk.mutate(order.number)}
                      type="button"
                    >
                      <span className="grid h-9 min-w-9 place-items-center rounded-control bg-ds-primary-soft px-1.5 text-base font-bold text-ds-link tabular-nums">
                        {order.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ds-text">
                          {order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}
                        </span>
                        <span className="block text-xs text-ds-muted">
                          {waitingTime.format(new Date(order.createdAt))}
                          {order.isStaff ? ' · Staff: check ID card' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div>
            <Label htmlFor="pos-instructions">
              Any instruction <span className="font-normal text-ds-muted">(optional, max 200)</span>
            </Label>
            <textarea
              className="mt-1 min-h-14 w-full rounded-control border border-ds-input bg-ds-surface px-3 py-2 text-sm text-ds-text outline-hidden focus:ring-2 focus:ring-ds-primary"
              id="pos-instructions"
              maxLength={200}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="For the whole order"
              value={instructions}
            />
          </div>

          {canApproveComplimentary ? (
            <Toggle
              checked={isComplimentary}
              label="Complimentary meal"
              onChange={setIsComplimentary}
            />
          ) : null}
          {isComplimentary ? (
            <div>
              <Label htmlFor="pos-comp-reason">
                Reason <span className="text-ds-status-bad-fg">*</span>
              </Label>
              <Input
                id="pos-comp-reason"
                maxLength={200}
                onChange={(event) => setComplimentaryReason(event.target.value)}
                placeholder="e.g. Duty doctor, patient attendant"
                value={complimentaryReason}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pos-mobile">Customer mobile</Label>
              <Input
                id="pos-mobile"
                inputMode="numeric"
                maxLength={10}
                onChange={(event) => setCustomerMobile(event.target.value.replace(/\D/g, ''))}
                placeholder="Optional"
                value={customerMobile}
              />
            </div>
            <div>
              <Label htmlFor="pos-employee">Employee ID</Label>
              <Input
                id="pos-employee"
                maxLength={50}
                onChange={(event) => setEmployeeCode(event.target.value)}
                placeholder="Optional"
                value={employeeCode}
              />
            </div>
          </div>
          {employee?.data ? (
            <p className="-mt-1.5 text-xs text-ds-text-3" role="status">
              <span className="font-semibold text-ds-text">{employee.data.employeeName}</span>
              {employee.data.employmentType
                ? ` · ${employmentTypeLabels[employee.data.employmentType]}`
                : ''}
              {' · '}
              {employee.data.discountPercent && !isComplimentary ? (
                <span className="font-semibold text-ds-status-ok-fg">
                  {employee.data.discountPercent}% {employee.data.discountName ?? 'staff discount'}
                </span>
              ) : (
                'no staff discount here'
              )}
            </p>
          ) : employee?.isError ? (
            <p className="-mt-1.5 text-xs text-ds-status-bad-fg" role="alert">
              {getApiErrorMessage(employee.error)}
            </p>
          ) : null}

          {isComplimentary ? null : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ds-text">Mode of payment</p>
              <div
                aria-label="Payment mode"
                className="grid grid-cols-4 gap-1 rounded-control-lg bg-ds-subtle p-1"
                role="group"
              >
                {paymentModes.map((mode) => {
                  const Icon = paymentIcons[mode];

                  return (
                    <button
                      aria-pressed={paymentMode === mode}
                      className={cn(
                        'flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary pointer-coarse:h-11',
                        paymentMode === mode
                          ? 'bg-ds-primary text-white shadow-md shadow-ds-primary/25'
                          : 'text-ds-text-2 hover:bg-ds-surface hover:text-ds-text',
                      )}
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      type="button"
                    >
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                      {paymentModeLabels[mode]}
                    </button>
                  );
                })}
              </div>
              {paymentMode === 'UPI' && upiOptions.length > 1 ? (
                <CollectVia
                  label="Collect UPI via"
                  onPick={setUpiVia}
                  options={upiOptions.map((option) => ({
                    label: option === 'OWN' ? 'Own QR' : providerLabels[option],
                    value: option,
                  }))}
                  value={collectVia}
                />
              ) : null}
              {paymentMode === 'CARD' && !isComplimentary && cardMachine ? (
                <CollectVia
                  label="Take the card on"
                  onPick={setCardVia}
                  options={[
                    { label: `Card machine · ${cardMachine.name}`, value: 'MACHINE' },
                    { label: 'Keyed in', value: 'MANUAL' },
                  ]}
                  value={cardVia}
                />
              ) : null}
              {paymentMode === 'CASH' || collectsOnline ? null : (
                <Input
                  aria-label="Payment reference"
                  className="h-9"
                  maxLength={100}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder={
                    paymentMode === 'OTHER'
                      ? 'How was it paid? (e.g. Sodexo)'
                      : `${paymentModeLabels[paymentMode]} reference (optional)`
                  }
                  value={paymentReference}
                />
              )}
            </div>
          )}

          {!isComplimentary &&
          paymentMode === 'UPI' &&
          collectVia === 'OWN' &&
          upiId &&
          totals.grandTotal > 0 ? (
            <div
              className="flex items-center gap-3 rounded-card border border-ds-primary-border bg-ds-primary-soft/50 p-3"
              ref={upiQrRef}
            >
              <UpiQr
                link={upiPayLink({
                  amount: totals.grandTotal,
                  payee: counter.restaurant.legalName ?? counter.restaurant.restaurantName,
                  upiId,
                })}
                size={112}
              />
              <p className="text-sm text-ds-text-2">
                Customer scans to pay{' '}
                <span className="font-semibold text-ds-text">{formatMoney(totals.grandTotal)}</span>{' '}
                to <span className="font-mono text-xs">{upiId}</span>. Enter the UPI reference above
                once paid.
              </p>
            </div>
          ) : null}

          {/* What the guest handed over, note by note, and the change due: for the cashier only. */}
          {takesCash ? (
            <div className="space-y-2.5">
              <div aria-label="Cash received" className="grid grid-cols-5 gap-1.5" role="group">
                {cashNotes.map((note) => (
                  <button
                    aria-label={`₹${note}`}
                    className="h-11 rounded-control border border-ds-status-ok-fg/20 bg-ds-status-ok-bg text-sm font-semibold text-ds-text tabular-nums transition-colors duration-150 hover:border-ds-status-ok-fg/50 active:scale-[0.97]"
                    key={note}
                    onClick={() => setCashReceived((sum) => sum + note)}
                    type="button"
                  >
                    {note}
                  </button>
                ))}
                <button
                  className="h-11 rounded-control border border-ds-primary-border bg-ds-primary-soft text-xs font-bold text-ds-link disabled:opacity-50"
                  disabled={totals.grandTotal === 0}
                  onClick={() => setCashReceived(totals.grandTotal)}
                  type="button"
                >
                  Exact
                </button>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-ds-muted uppercase">
                    Received
                  </p>
                  <p className="font-mono text-lg font-bold text-ds-text">
                    {formatMoney(cashReceived)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-ds-muted uppercase">
                    {cashChange > 0 ? 'Change' : 'Pending'}
                  </p>
                  <p
                    className={cn(
                      'font-mono text-lg font-bold',
                      cashChange > 0 ? 'text-ds-status-ok-fg' : 'text-ds-status-pending-fg',
                    )}
                  >
                    {formatMoney(cashChange > 0 ? cashChange : cashPending)}
                  </p>
                </div>
                <Button
                  disabled={cashReceived === 0}
                  onClick={() => setCashReceived(0)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          {cart.length === 0 ? (
            <p className="rounded-control bg-ds-subtle px-3 py-3 text-sm text-ds-muted">
              No items yet. Tap ADD on the menu.
            </p>
          ) : (
            <div className="space-y-2 border-t border-ds-divider pt-3">
              {/* Tap an item for its kitchen note; × takes it off the bill. */}
              <ul aria-label="Items on the bill" className="flex flex-wrap gap-1.5">
                {cart.map((line, index) => (
                  <li
                    className={cn(
                      'flex max-w-full items-center rounded-full border text-[13px] text-ds-text',
                      noteOpenFor === index
                        ? 'border-ds-primary bg-ds-primary-soft'
                        : 'border-ds-primary-border bg-ds-primary-soft/50',
                    )}
                    key={`${line.item.id}-${index}`}
                  >
                    <button
                      className="min-w-0 truncate py-1.5 pr-1 pl-3 text-left font-semibold"
                      onClick={() => setNoteOpenFor(noteOpenFor === index ? null : index)}
                      title="Note for the kitchen"
                      type="button"
                    >
                      {line.quantity} × {line.item.itemName}
                      {line.note ? (
                        <span className="font-normal text-ds-muted"> · {line.note}</span>
                      ) : null}
                    </button>
                    <button
                      aria-label={`Remove ${line.item.itemName}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ds-status-bad-fg hover:bg-ds-status-bad-bg pointer-coarse:h-10 pointer-coarse:w-10"
                      onClick={() => changeQuantity(index, -line.quantity)}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              {noteLine ? (
                <Input
                  aria-label={`Note for ${noteLine.item.itemName}`}
                  autoFocus
                  className="h-9 text-xs"
                  maxLength={200}
                  onChange={(event) =>
                    setCart((lines) =>
                      lines.map((entry, at) =>
                        at === noteOpenFor ? { ...entry, note: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder={`Note for ${noteLine.item.itemName} (less spicy, no onion…)`}
                  value={noteLine.note}
                />
              ) : null}
              <div className="rounded-card bg-ds-subtle px-3.5 py-3">
                <BillTotals
                  {...totals}
                  discountPercent={staffDiscount}
                  gstRates={[...new Set(cart.map((line) => line.item.gstPercent))].filter(Boolean)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2.5 lg:sticky lg:-bottom-4 lg:-mx-4 lg:-mb-4 lg:border-t lg:border-ds-divider lg:bg-ds-surface lg:px-4 lg:py-3">
            {submitted && problems.length > 0 ? (
              <ul className="space-y-0.5 text-sm text-ds-status-bad-fg" role="alert">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
            <p className="flex items-baseline gap-2 text-ds-text">
              <span
                className="pop inline-block font-mono text-xl font-bold"
                key={totals.grandTotal}
              >
                {formatMoney(totals.grandTotal)}
              </span>
              <span className="text-xs font-semibold tracking-wide text-ds-muted uppercase">
                Total ({itemCount} item{itemCount === 1 ? '' : 's'})
              </span>
            </p>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button
                className="h-12 px-5 text-ds-status-bad-fg hover:border-ds-status-bad-fg/40 hover:bg-ds-status-bad-bg hover:text-ds-status-bad-fg"
                disabled={bill.isPending || cart.length === 0}
                onClick={resetBill}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="h-12 text-[15px]"
                disabled={bill.isPending}
                id="pos-complete"
                onClick={complete}
                type="button"
              >
                {bill.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Complete order
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <Modal
        footer={
          completed ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void printBill(completed)} type="button">
                <Printer className="h-4 w-4" />
                Print bill
              </Button>
              <Button onClick={() => printKot(completed)} type="button" variant="outline">
                <Printer className="h-4 w-4" />
                Print KOT
              </Button>
              <Button
                className="ml-auto"
                onClick={() => setCompleted(null)}
                type="button"
                variant="secondary"
              >
                New bill
              </Button>
            </div>
          ) : null
        }
        onClose={() => setCompleted(null)}
        open={completed !== null}
        title="Bill completed"
      >
        {completed ? (
          <div className="space-y-2 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-ds-status-ok-fg" />
            <p className="font-mono text-sm text-ds-muted">{completed.billNumber}</p>
            <p className="text-3xl font-bold text-ds-text">{formatMoney(completed.grandTotal)}</p>
            <p className="text-sm text-ds-text-2">
              {completed.isComplimentary
                ? 'Complimentary'
                : `Paid by ${completed.paymentMode ? paymentModeLabels[completed.paymentMode] : '—'}`}
              {completed.roomNumber ? ` · Room ${completed.roomNumber}` : ''}
            </p>
            <p className="text-sm text-ds-muted">
              Order number{' '}
              <span className="text-lg font-bold text-ds-text">{completed.orderNumber}</span>
            </p>
          </div>
        ) : null}
      </Modal>
      <UnsentBillsDialog unsent={unsent} />
      <OnlinePaymentDialog
        onClose={() => setOnlinePayment(null)}
        onPaid={(paid) => {
          if (!onlinePayment) return;
          bill.mutate({
            ...onlinePayment,
            payload: {
              ...onlinePayment.payload,
              onlinePaymentId: paid.id,
              paymentReference: paid.paidReference ?? undefined,
            },
          });
          setOnlinePayment(null);
        }}
        request={onlinePayment?.request ?? null}
      />
    </section>
  );
}

/** How the picked payment mode is collected: one chip per way, the chosen one ticked. */
function CollectVia<T extends string>({
  label,
  onPick,
  options,
  value,
}: Readonly<{
  label: string;
  onPick: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}>) {
  return (
    <div aria-label={label} className="flex flex-wrap items-center gap-1.5" role="group">
      <span className="mr-1 text-xs font-semibold text-ds-text-3">Collect via</span>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            'flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-semibold transition pointer-coarse:h-11',
            value === option.value
              ? 'border-ds-primary-border bg-ds-primary-soft text-ds-link'
              : 'border-ds-border text-ds-text-2 hover:bg-ds-subtle',
          )}
          key={option.value}
          onClick={() => onPick(option.value)}
          type="button"
        >
          {value === option.value ? (
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
          ) : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}
