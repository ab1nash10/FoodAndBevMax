'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  EmploymentType,
  FoodType,
  PaymentMode,
  PosBill,
  PosBillInput,
  PosChannel,
  PosMenuItem,
} from '@aahar/api-client';
import {
  AppPageHeader,
  FoodTypeMarker,
  KeyboardHint,
  StatusChip,
} from '@/components/design-system';
import { useRestaurantOrders } from '@/components/organization/restaurant-orders-page';
import { useToast } from '@/components/toast-provider';
import { Input, Label, Panel, Skeleton } from '@/components/ui';
import { Modal, SegmentedControl, Toggle } from '@/components/ui-controls';
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

/**
 * The till: pick items from the counter's menu, take the customer's details and how they paid,
 * and complete the bill. Prices, GST and stock are checked again by the server; a retry of the
 * same bill (a double tap, a dropped connection) returns the bill already made.
 */
export function BillingPageClient() {
  const { counter, counters, query: countersQuery, setCounterId } = usePosCounter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<PosChannel>('COUNTER');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
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
  const upiQrRef = useRef<HTMLDivElement>(null);

  // The QR sits in the scrolling bill, above the pinned payment buttons: bring it into view
  // when UPI is picked.
  useEffect(() => {
    if (paymentMode === 'UPI') upiQrRef.current?.scrollIntoView({ block: 'nearest' });
  }, [paymentMode]);
  const [clientOrderId, setClientOrderId] = useState(newClientOrderId);
  const [completed, setCompleted] = useState<PosBill | null>(null);
  const [submitted, setSubmitted] = useState(false);
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
  const ordersQuery = useRestaurantOrders(counter?.restaurantId);
  const activeOrders = (ordersQuery.data ?? []).filter((order) => order.source === 'COUNTER');

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
    const counts = new Map<string, { count: number; id: string; name: string }>();

    for (const item of menu) {
      const id = item.category?.id ?? '';
      const entry = counts.get(id) ?? {
        count: 0,
        id,
        name: item.category?.categoryName ?? 'Other',
      };
      entry.count += 1;
      counts.set(id, entry);
    }

    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [menu]);

  const term = search.trim().toLowerCase();
  const shown = menu.filter(
    (item) =>
      (!categoryId || (item.category?.id ?? '') === categoryId) &&
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
  const problems = [
    cart.length === 0 && 'Add at least one item.',
    channel === 'ROOM' && !roomNumber.trim() && 'Enter the room number.',
    customerMobile && !mobilePattern.test(customerMobile) && 'Customer mobile must be 10 digits.',
    employeeCode.trim() &&
      employee?.isError &&
      'The Employee ID matches no employee here. Correct it or clear it.',
    isComplimentary && !complimentaryReason.trim() && 'Say why the meal is complimentary.',
  ].filter((problem): problem is string => Boolean(problem));

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
    setSubmitted(false);
    setClientOrderId(newClientOrderId());
  }

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
      setCompleted(saved);
      resetBill();
    },
  });

  function complete() {
    setSubmitted(true);
    if (problems.length > 0 || bill.isPending) return;

    bill.mutate({
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
      },
      summary: cart.map((line) => `${line.quantity} × ${line.item.itemName}`).join(', '),
      total: totals.grandTotal,
    });
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

  if (!counter) {
    return (
      <section className="space-y-4">
        <AppPageHeader title="Billing" />
        <NoCounter isLoading={countersQuery.isLoading} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <div className="flex flex-wrap items-center gap-2">
            <UnsentBillsButton unsent={unsent} />
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
        description="Pick items, take payment and complete the bill. The kitchen sees it at once."
        title="Billing"
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[200px_minmax(0,1fr)_400px]">
        {/* A column on the left from xl (laptops), scrolling on its own like the bill; below that,
            last, under the menu (not across, where the sticky bill would slide under it). */}
        <Panel
          aria-label="Active orders"
          className="order-last p-3 xl:sticky xl:top-[calc(var(--app-header-h)+1.5rem)] xl:order-0 xl:max-h-[calc(100dvh-var(--app-header-h)-9.5rem)] xl:self-start xl:overflow-y-auto"
          role="region"
        >
          <h2 className="text-sm font-semibold text-ds-link">
            Active orders
            {activeOrders.length > 0 ? (
              <span className="ml-1.5 font-normal text-ds-muted tabular-nums">
                {activeOrders.length}
              </span>
            ) : null}
          </h2>
          {activeOrders.length === 0 ? (
            <p className="mt-2 text-xs text-ds-muted italic">No active orders right now.</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-1">
              {activeOrders.map((order) => (
                <li className="rounded-control border border-ds-border p-2" key={order.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">#{order.orderNumber}</span>
                    <StatusChip status={order.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ds-text-3">
                    {order.roomNumber ? `Room ${order.roomNumber} · ` : ''}
                    {order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Order type"
              onChange={setChannel}
              options={[
                { label: 'Counter', value: 'COUNTER' },
                { label: 'Room', value: 'ROOM' },
              ]}
              value={channel}
            />
            <div aria-label="Food types shown" className="flex flex-wrap gap-3" role="group">
              {allFoodTypes.map((type) => (
                <span className="inline-flex items-center gap-2 text-sm font-semibold" key={type}>
                  <FoodTypeMarker type={type} />
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
            <label className="relative ml-auto min-w-48 flex-1 sm:max-w-72">
              <span className="sr-only">Search the menu</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ds-muted" />
              <Input
                className="pl-9"
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
                placeholder="Search item or code"
                ref={searchRef}
                value={search}
              />
            </label>
          </div>
          {/* Keys are for a till with a keyboard: the hints show from laptop width. */}
          <div
            className={cn(
              'flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs',
              searchMessage ? 'flex' : 'hidden lg:flex',
            )}
          >
            {searchMessage ? (
              <p className="text-ds-status-bad-fg" role="status">
                {searchMessage}
              </p>
            ) : null}
            <p className="ml-auto hidden items-center gap-3 text-ds-muted lg:flex">
              <span>
                <KeyboardHint keys={['Enter']} /> adds
              </span>
              <span>
                <KeyboardHint keys={['F9']} /> completes
              </span>
              <span>
                <KeyboardHint keys={['F2']} /> search
              </span>
              <span>
                <KeyboardHint keys={['+', '−', 'Del']} /> last item
              </span>
            </p>
          </div>
          <div aria-label="Categories" className="flex flex-wrap gap-1.5" role="group">
            {[{ count: menu.length, id: '', name: 'All' }, ...categories].map((category) => (
              <button
                aria-pressed={categoryId === category.id}
                className={cn(
                  'h-9 rounded-full border px-4 text-[13px] font-semibold transition',
                  categoryId === category.id
                    ? 'border-ds-primary bg-ds-primary text-white'
                    : 'border-ds-border bg-ds-surface text-ds-text-2 hover:border-ds-primary/40',
                )}
                key={category.id || 'all'}
                onClick={() => setCategoryId(category.id)}
                type="button"
              >
                {category.name}
                <span className="ml-1.5 tabular-nums opacity-70">{category.count}</span>
              </button>
            ))}
          </div>
          {menuQuery.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : menuQuery.isError ? (
            <p className="py-10 text-center text-sm text-ds-status-bad-fg">
              {getApiErrorMessage(menuQuery.error)}
            </p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-ds-muted">
              {menu.length === 0
                ? `Nothing on this restaurant's menu is sold for ${channel === 'ROOM' ? 'rooms' : 'the counter'}.`
                : 'No item matches.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
              {shown.map((item) => {
                const inCart = quantityInCart(item.id);
                const reason = unavailableReason(item, inCart);

                return (
                  <li key={item.id}>
                    <button
                      aria-label={`Add ${item.itemName}`}
                      className={cn(
                        'flex h-full min-h-28 w-full flex-col justify-between gap-3 rounded-[18px] border p-3.5 text-left transition duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary active:scale-[0.98]',
                        reason
                          ? 'cursor-not-allowed border-ds-border bg-ds-subtle opacity-60'
                          : 'border-ds-border bg-ds-surface hover:border-ds-primary-border hover:shadow-card-hover motion-safe:hover:-translate-y-0.5',
                        inCart > 0 && 'border-ds-primary ring-1 ring-ds-primary',
                      )}
                      disabled={Boolean(reason)}
                      onClick={() => addItem(item)}
                      type="button"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-[14px] leading-snug font-semibold text-ds-text">
                          {item.itemName}
                        </span>
                        <span className="mt-0.5">
                          <FoodTypeMarker type={item.foodType} />
                        </span>
                      </span>
                      <span className="flex items-end justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-mono text-[15px] font-semibold text-ds-text">
                            {item.price === null ? '—' : formatMoney(item.price)}
                          </span>
                          <span
                            className={cn(
                              'block truncate text-[11.5px]',
                              reason ? 'text-ds-status-bad-fg' : 'text-ds-muted',
                            )}
                          >
                            {reason ?? (item.stock === null ? '' : `${item.stock - inCart} left`)}
                          </span>
                        </span>
                        {inCart > 0 ? (
                          <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-ds-primary px-2 font-mono text-[13px] font-semibold text-white">
                            ×{inCart}
                          </span>
                        ) : reason ? null : (
                          <span
                            aria-hidden="true"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ds-primary-soft text-ds-link"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.2} />
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Sticks below the shell header (--app-header-h), short enough to fit on screen before the page scrolls. */}
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
        <Panel
          className="flex scroll-mt-[calc(var(--app-header-h)+1rem)] flex-col gap-4 p-4 pb-24 lg:sticky lg:top-[calc(var(--app-header-h)+1.5rem)] lg:max-h-[calc(100dvh-var(--app-header-h)-9.5rem)] lg:self-start lg:overflow-y-auto lg:pb-4"
          id="pos-bill"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ds-text">
              Current bill
              <span className="ml-2 text-sm font-normal text-ds-muted">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </span>
            </h2>
            {cart.length > 0 ? (
              <Button onClick={() => setCart([])} size="sm" type="button" variant="ghost">
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
          </div>

          {channel === 'ROOM' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pos-room">
                  Room <span className="text-ds-status-bad-fg">*</span>
                </Label>
                <Input
                  id="pos-room"
                  maxLength={20}
                  onChange={(event) => setRoomNumber(event.target.value)}
                  placeholder="e.g. 412"
                  value={roomNumber}
                />
              </div>
              <div>
                <Label htmlFor="pos-bed">Bed</Label>
                <Input
                  id="pos-bed"
                  maxLength={20}
                  onChange={(event) => setBedNumber(event.target.value)}
                  placeholder="Optional"
                  value={bedNumber}
                />
              </div>
            </div>
          ) : null}

          {cart.length === 0 ? (
            <p className="rounded-card border border-dashed border-ds-border py-8 text-center text-sm text-ds-muted">
              Tap an item to add it.
            </p>
          ) : (
            <ul className="divide-y divide-ds-divider">
              {cart.map((line, index) => (
                <li className="py-2.5" key={`${line.item.id}-${index}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">
                      <FoodTypeMarker type={line.item.foodType} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ds-text">
                        {line.item.itemName}
                      </p>
                      <p className="font-mono text-xs text-ds-muted">
                        {formatMoney(line.item.price)} · GST {line.item.gstPercent}%
                        {line.item.isGstInclusive ? ' incl.' : ''}
                      </p>
                    </div>
                    <div className="flex items-center rounded-control border border-ds-border">
                      <button
                        aria-label={`One less ${line.item.itemName}`}
                        className="grid h-8 w-8 place-items-center text-ds-text-2 hover:bg-ds-subtle"
                        onClick={() => changeQuantity(index, -1)}
                        type="button"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        aria-label={`One more ${line.item.itemName}`}
                        className="grid h-8 w-8 place-items-center text-ds-text-2 hover:bg-ds-subtle"
                        onClick={() => changeQuantity(index, 1)}
                        type="button"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      aria-label={`Remove ${line.item.itemName}`}
                      className="grid h-8 w-8 place-items-center text-ds-muted hover:text-ds-status-bad-fg"
                      onClick={() => changeQuantity(index, -line.quantity)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Input
                    aria-label={`Note for ${line.item.itemName}`}
                    className="mt-1.5 h-8 text-xs"
                    maxLength={200}
                    onChange={(event) =>
                      setCart((lines) =>
                        lines.map((entry, at) =>
                          at === index ? { ...entry, note: event.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Note for the kitchen (less spicy, no onion…)"
                    value={line.note}
                  />
                </li>
              ))}
            </ul>
          )}

          <div>
            <Label htmlFor="pos-instructions">Instructions</Label>
            <textarea
              className="mt-1 min-h-16 w-full rounded-control border border-ds-input bg-ds-surface px-3 py-2 text-sm text-ds-text outline-hidden focus:ring-2 focus:ring-ds-primary"
              id="pos-instructions"
              maxLength={200}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="For the whole order"
              value={instructions}
            />
            <p className="text-right text-[11px] text-ds-muted">{instructions.length}/200</p>
          </div>

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
            <p className="-mt-2 text-xs text-ds-text-3" role="status">
              <span className="font-semibold text-ds-text">{employee.data.employeeName}</span>
              {employee.data.employmentType
                ? ` · ${employmentTypeLabels[employee.data.employmentType]}`
                : ''}
              {' · '}
              {employee.data.discountPercent && !isComplimentary ? (
                <span className="font-semibold text-ds-status-ok-fg">
                  {employee.data.discountPercent}% staff discount
                </span>
              ) : (
                'no staff discount here'
              )}
            </p>
          ) : employee?.isError ? (
            <p className="-mt-2 text-xs text-ds-status-bad-fg" role="alert">
              {getApiErrorMessage(employee.error)}
            </p>
          ) : null}

          <Toggle
            checked={isComplimentary}
            label="Complimentary meal"
            onChange={setIsComplimentary}
          />
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
          ) : paymentMode === 'UPI' && upiId && totals.grandTotal > 0 ? (
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
                to <span className="font-mono text-xs">{upiId}</span>. Enter the UPI reference below
                once paid.
              </p>
            </div>
          ) : null}

          {/* Payment, totals and the buttons stay pinned to the panel's foot while the bill
              scrolls, so how it's paid is always in view beside Complete order. */}
          <div className="space-y-3 lg:sticky lg:-bottom-4 lg:-mx-4 lg:-mb-4 lg:border-t lg:border-ds-divider lg:bg-ds-surface lg:p-4">
            {isComplimentary ? null : (
              <div className="space-y-2">
                <div aria-label="Payment mode" className="grid grid-cols-4 gap-1.5" role="group">
                  {paymentModes.map((mode) => {
                    const Icon = paymentIcons[mode];

                    return (
                      <button
                        aria-pressed={paymentMode === mode}
                        className={cn(
                          'flex h-11 items-center justify-center gap-1.5 rounded-[12px] border text-[13px] font-semibold transition',
                          paymentMode === mode
                            ? 'border-ds-primary bg-ds-primary-soft text-ds-link ring-1 ring-ds-primary'
                            : 'border-ds-border bg-ds-surface text-ds-text-2 hover:border-ds-primary/40',
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
                {paymentMode === 'CASH' ? null : (
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
            <BillTotals
              {...totals}
              discountPercent={staffDiscount}
              gstRates={[...new Set(cart.map((line) => line.item.gstPercent))].filter(Boolean)}
            />

            {submitted && problems.length > 0 ? (
              <ul className="space-y-0.5 text-sm text-ds-status-bad-fg" role="alert">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}

            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button
                className="h-14 px-4"
                disabled={bill.isPending || cart.length === 0}
                onClick={resetBill}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                // Label and amount on one line where the bill is wide enough; on a phone the
                // amount wraps under the label instead of pushing the page sideways.
                className="h-auto min-h-14 flex-wrap justify-between gap-x-3 gap-y-0 rounded-2xl px-4 py-1.5 text-[15px] shadow-lg shadow-ds-primary/25"
                disabled={bill.isPending}
                id="pos-complete"
                onClick={complete}
                type="button"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {bill.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  Complete order
                </span>
                <span className="font-mono text-base whitespace-nowrap">
                  {formatMoney(totals.grandTotal)}
                </span>
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
    </section>
  );
}
