# Implicit state machines in AAHAR

A state machine is "implicit" when its states and allowed moves are not written down in one place:
a `status` column changed from many services, a state implied by nullable timestamps or flags
(`paidAt`, `cancelledAt`, `deletedAt`, `billedOrderId`), or a screen step kept in `useState`.
This file maps each one: where its state lives, every transition (trigger, guard, code), and where
the moves are not guarded.

Status: complete, 2026-11-20. Pass 1 took the inventory; pass 2 mapped every transition in four
areas (POS and payments, inventory and kitchen, sign-in and master data, portal screens). Items
marked "checked" were confirmed in the code by hand; the rest come from a full read of each area
and carry file:line references to check before fixing. Nothing in the code was changed.

Refreshed 2026-11-23 after the ERP GRN rewrite (owed returns, batches on hold, close reasons,
refusal log, manual GRNs removed): the GRN rows and inventory findings 3-6 are new, and the
fix-first list was checked again in the current tree.

Fixed 2026-11-23 (uncommitted at the time, each with a test written first): all seven fix-first
items; inventory findings 1, 4 (a 5-minute catch-up runs waiting returns), 7 and 8; POS findings
1-3 and the cancel, ready and steward timestamps; portal findings 1-3, 5 and 6 (4 is covered by
the server sweep, which bills the kiosk order even if the screen lost it), the board and the
production draft; sign-in findings 1, 3, 4 (disabling clears the lock) and 7. What is left needs
a product decision: the refund state, recalling stock in transit, amendment rules, ERP drift,
cascades and frozen children, the closed-GRN reopen, dead tables, the dev code and names after
delete.

## Fix first

These lost money, lost bills or let someone in. All seven are fixed (2026-11-23):

1. unsent bills are kept through sign-out and sent only by the cashier who queued them;
2. a paid payment is kept until its bill succeeds, and the retry bills the same payment;
3. a server sweep every 60 s settles QR and kiosk payments the guest's page left, and lets go of
   orders unpaid after 30 minutes;
4. Razorpay-order and PayU payments cancelled in the last 30 minutes are asked again; one found
   paid is flagged for a refund;
5. a failed QR bill re-reads the payment and marks the order BILLED when another call billed it;
   the refund audit row is written only when the status changed;
6. the guest code counts the try before comparing;
7. stock rows are one per key (`NULLS NOT DISTINCT`, migration 20261123090000) and stock is added
   by one `INSERT … ON CONFLICT`.

The table keeps what each one was.

| #   | What happens                                                                                                                                              | Where                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Signing out (or being signed out by a sign-in elsewhere) deletes the till's unsent bills, online-paid ones included                                       | `lib/auth-storage.ts` clears `aahar.pos.unsent-bills.*`                            |
| 2   | A refused bill (price changed) drops the guest's paid payment; Complete again charges them twice                                                          | `billing-page.tsx` onPaid                                                          |
| 3   | QR and kiosk payments settle only while the guest's browser is open; no webhook or sweeper, so a paid order can stay unbilled and never reach the kitchen | `qr-orders.service.ts` status / cancel                                             |
| 4   | A payment made after a Razorpay order is cancelled is never seen again                                                                                    | `online-payment-providers.ts` cancel                                               |
| 5   | Two overlapping checks can flag a billed QR order "paid but not billed: refund it"                                                                        | `pos.service.ts` (no re-check after the shift lock), `qr-orders.service.ts` bill() |
| 6   | The QR guest sign-in code can be guessed with parallel tries                                                                                              | `qr-orders.service.ts` verifyGuestOtp                                              |
| 7   | Duplicate stock balance rows: the unique key has nullable columns                                                                                         | `stock_balances_unique_stock_key`                                                  |

Then, by theme: there is **no refund state** anywhere (cancelled bills keep their payment PAID;
PAID_NOT_BILLED has no exit); **stock in transit can't be recalled**; **amendments skip
billing's checks**; **dead states and tables** (the old manual Grn table, KioskOrder, StaffDiscountOtp,
two `deleted_at` columns) mislead readers; and the **active / inactive / deleted lifecycle is
copied into each service** with different cascades and name rules. A shared transition helper
(conditional update on the expected status, checked by count) would replace most of the
hand-written guards.

## Inventory

### Explicit status enums (state declared; transitions spread across code)

| Model                   | Field                       | States                                                                                                              |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| RestaurantOrder         | status: OrderStatus         | PLACED, PREPARING, READY, COLLECTED, CANCELLED (+ acceptedAt, readyAt, deliveredAt, stewardAssignedAt, cancelledAt) |
| OnlinePayment           | status: OnlinePaymentStatus | PENDING, PAID, CANCELLED, EXPIRED (+ paidAt, orderId)                                                               |
| QrOrder                 | status: QrOrderStatus       | AWAITING_PAYMENT, BILLED, PAID_NOT_BILLED, CLOSED (+ billedOrderId)                                                 |
| CounterShift            | status: CounterShiftStatus  | OPEN, CLOSED, HANDED_OVER (+ closedAt, takenOverFrom/By)                                                            |
| Grn                     | status: GrnStatus           | **dead since 2026-11-21** (Deliveries (GRN) removed): nothing writes it; stock history still reads old rows         |
| GrnEntry (ERP intake)   | status: GrnEntryStatus      | PENDING, VERIFIED, CLOSED (+ verifiedAt, rerunActive; flag 0 goods in, 1 return to vendor)                          |
| ErpGrnRefusal           | —                           | write-once log of refused ERP GRNs (Logs → ERP GRN errors)                                                          |
| Transfer                | status: TransferStatus      | DRAFT, PENDING_ACKNOWLEDGEMENT, ACKNOWLEDGED, CANCELLED                                                             |
| TransferAcknowledgement | status                      | ACCEPTED_FULL, ACCEPTED_PARTIAL, REJECTED_FULL (outcome, not a lifecycle)                                           |
| KitchenProduction       | status                      | DRAFT, POSTED, CANCELLED                                                                                            |
| ErpPosting              | status                      | PENDING, SUCCESS, FAILED, EMPTY                                                                                     |
| User                    | status: UserStatus          | ACTIVE, DISABLED (+ lastActiveAt drives the 8 h credential lock)                                                    |
| Role                    | status: RecordStatus        | ACTIVE, INACTIVE                                                                                                    |

### State implied by timestamps, counters or links (no status column)

| Model            | Fields that make the state                                               |
| ---------------- | ------------------------------------------------------------------------ |
| KioskOrder       | billedOrderId (unbilled → billed)                                        |
| StaffDiscountOtp | attempts, expiresAt, verifiedAt (sent → verified / expired / locked out) |
| CounterDayClose  | its existence closes a counter's business day                            |
| OrderAmendment   | amendedAt (48 h payment-mode window on a bill)                           |
| PosDevice        | till enrolment (tillKeyHash) and its user list                           |

### Active / inactive / deleted (one lifecycle, repeated on ~20 masters)

`isActive` + `deletedAt` on Hospital, LegalEntity, Location, Store, Kitchen, Room, Restaurant,
RestaurantKitchen, Counter, PosDevice, PosDeviceRestaurant, PaymentMachine, ItemCategory, Item,
ItemPrice (+ effectiveTo), TimeSlot, StoreItem, KitchenItem, RestaurantMenu (+ isAvailable),
Employee. Three states (active, inactive, deleted) and the moves between them.

### Outside the database

Sign-in OTPs, OTP tries and lockout, refresh-token sessions (one browser per user), the access
cache, QR guest sign-in (`qr-guest:tries:*`).

### In the browser

Step state in screens: kiosk (welcome → menu → paying → done / not billed), QR order checkout,
the till's bill → online payment → bill flow, online payment dialog, shift controls, the POS gate,
sign-in, the TV board.

## Inventory and kitchen (pass 2)

Most document moves are safe: the handler locks the row (`common/row-lock.ts`, `SELECT … FOR
UPDATE`) inside the transaction, re-reads the status, and changes stock in the same transaction.
The weak spots are the stock balance rows, not the status flags.

| Machine           | States in use                                                                                                                                                                                                                                       | Moves (guard)                                                                                                                | Ends                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| GrnEntry (ERP)    | one status per GRN number. Arrival moves stock at once; PENDING = a return still owed → VERIFIED (all moved) / CLOSED (rest written off with a fixed reason); VERIFIED or CLOSED → PENDING when the same grn_No is resent and leaves something owed | advisory lock per GRN number; returns take stock by conditional decrement, the rest is owed; DB CHECK on accepted + rejected | none (reopens)                    |
| Owed-return rerun | `rerunActive` on ↔ paused; reruns on a store arrival (in-memory signal after commit), on Run, on resume                                                                                                                                             | same GRN lock; `whileWaiting` refuses anything not PENDING                                                                   | settled or closed                 |
| Batch on hold     | derived, no column: a PENDING return with something left puts that batch on hold at the location's counters                                                                                                                                         | POS reads it when billing (`heldForReturn`), no lock                                                                         | when the return settles or closes |
| Transfer          | DRAFT → PENDING_ACKNOWLEDGEMENT → ACKNOWLEDGED; DRAFT → CANCELLED                                                                                                                                                                                   | row lock; acknowledgement unique per transfer (second one rolls back)                                                        | ACKNOWLEDGED, CANCELLED           |
| KitchenProduction | DRAFT → POSTED / CANCELLED                                                                                                                                                                                                                          | row lock + re-read                                                                                                           | POSTED, CANCELLED                 |
| Stock balance     | quantity per location / item / batch / business day                                                                                                                                                                                                 | every decrease is conditional (`available >= qty`); increases are find-then-create                                           | —                                 |

Findings (checked against the code, 2026-11-20):

1. **Duplicate stock rows are possible.** `stock_balances_unique_stock_key` includes
   `batch_number`, `expiry_date` and `business_date`, which are often NULL, and Postgres treats
   NULLs as different, so the key never blocks a duplicate. Every "add stock" path is
   find-then-create without a lock. Two first receipts at the same moment make two rows; a
   transfer then sees only one and can refuse stock that exists. None in the dev database yet.
   Fix: `NULLS NOT DISTINCT` on the index (Postgres 15+) or an upsert.
2. **Stock can be stuck in transit.** A dispatched transfer (PENDING_ACKNOWLEDGEMENT) has no
   cancel, recall or timeout; its stock has already left the source.
3. **The whole `Grn` table is dead** since Deliveries (GRN) was removed: no code writes it and
   `GrnStatus` is unused; only stock history reads old rows. Drop it, or mark it legacy.
4. **An owed return's rerun can be missed** (2026-11-23). The store-arrival signal is in memory
   and fires after the commit (`common/store-arrivals.ts`); a restart in between leaves the
   return waiting, and its batch on hold at the counters, until that batch arrives again or
   someone presses Run. (The old "return check before the lock" finding is gone: the rewrite
   locks first and takes stock by conditional decrement.)
5. **A closed GRN reopens** when the same grn_No is resent and leaves something owed
   (`erp-grns.service.ts` settle): status goes back to PENDING and `verifiedAt`/`verifiedBy`
   are cleared, so who closed it survives only in the audit log and the rows' rejection reason.
   Check this is wanted.
6. **The hold check is not locked**: a sale billed while a new return is being saved can sell a
   batch that is put on hold a moment later. Low impact.
7. **A POS cancel puts stock back on a different row** than the sale took it from (sale: oldest
   business day; cancel: newest or a no-date row), so ready-made stock drifts between day rows.
8. **Ledger `balanceAfter` can be off** for discard, ERP return and POS sale: it is computed from
   a value read before the update.
9. Smaller: a cancelled production cannot be cancelled again; discards write
   a ledger row with no reference; `RESTAURANT_RECEIVE_IN` and `reserved_qty` are never written;
   `transfers.deleted_at` is never set; the `GrnEntry` comment in `schema.prisma` is out of date.

## POS and payments (pass 2)

| Machine                      | States                                                                                                         | Moves (guard)                                                                                              | Ends / gaps                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| RestaurantOrder              | PLACED → PREPARING → READY → COLLECTED; → CANCELLED (+ acceptedAt, readyAt, deliveredAt, cancelledAt, steward) | kitchen moves: conditional update on the read status; POS cancel: counter, shift and order locks + re-read | COLLECTED, CANCELLED                                                                            |
| OnlinePayment                | PENDING → PAID / EXPIRED / CANCELLED; PAID → used by a bill (orderId)                                          | conditional updates; one bill per payment (unique orderId)                                                 | no "refunded"; PAID with no bill has no state or report                                         |
| QrOrder (QR + kiosk)         | AWAITING_PAYMENT → BILLED / PAID_NOT_BILLED / CLOSED                                                           | conditional updates, but only run when the guest's browser asks                                            | PAID_NOT_BILLED has no exit (no "refunded")                                                     |
| CounterShift                 | OPEN → CLOSED / HANDED_OVER (→ taken over)                                                                     | counter + user locks, re-check; one taken-over per shift (unique)                                          | one-open-shift is app code only                                                                 |
| CounterDayClose              | day open → closed                                                                                              | counter lock, no open shift, unique (counter, day)                                                         | later bills go to the next business day                                                         |
| ErpPosting                   | PENDING → SUCCESS / FAILED; EMPTY                                                                              | one PENDING per restaurant-day (partial unique index)                                                      | stale PENDING swept only by the next send                                                       |
| POS till                     | user not enrolled → enrolled (key hash) → revoked                                                              | computer name must match; 5 s cache per process                                                            | revoke is undone by re-enrolling the same name                                                  |
| KioskOrder, StaffDiscountOtp | —                                                                                                              | —                                                                                                          | **dead tables**: nothing writes them any more (kiosk now uses QrOrder; guest OTPs are in Redis) |

Findings:

1. **A billed QR order can be flagged "paid but not billed: refund it"** (checked again
   2026-11-23). Under the shift lock only the shift is re-checked, never the QR order
   (`pos.service.ts:991-999`). When two status/cancel calls overlap, the second waits on the
   lock, then hits "payment already on another bill" (409). Both result writes are now
   conditional on AWAITING_PAYMENT (`qr-orders.service.ts:885-897`), but whichever lands first
   wins, so the loser's PAID_NOT_BILLED can beat the winner's BILLED; and the "refund it" audit
   row is written either way (`:898`).
2. **A payment made after a Razorpay order is cancelled is never seen** (checked). Razorpay order
   cancel does nothing (`online-payment-providers.ts:130-132`); AAHAR then marks the payment
   CANCELLED and `check()` skips anything not PENDING (`online-payments.service.ts:165`), so it
   never asks again; the comment there saying "found by the next check" is wrong. With a changed provider key, `cancel` also marks CANCELLED
   without asking. Whether Razorpay auto-refunds depends on the account's capture setting.
3. **Nothing settles payments in the background.** QR and kiosk orders move only while the
   guest's browser polls; there is no webhook or sweeper. A guest who pays and closes the page
   leaves the order AWAITING_PAYMENT, unbilled, with the kitchen never told.
4. **No refund state anywhere.** Cancelling a bill leaves its payment PAID and its QR order
   BILLED; PAID_NOT_BILLED has no exit and its list shows only the newest 100.
5. **Amendments skip billing's controls**: allowed after the day is closed, and a typed UPI or
   card reference is accepted, which billing itself refuses, so cash can be re-booked as UPI.
6. **The ERP can drift from AAHAR**: a bill can be cancelled after its day was sent; bills are
   picked by `placedAt` but posted under their business day.
7. Smaller: the POS cancel allows READY/COLLECTED → CANCELLED which the kitchen rule
   (`NEXT_STATUSES`) forbids; kitchen and external cancels leave `cancelledAt` empty; READY →
   PREPARING keeps `readyAt`; steward changes are read-then-write; the guest OTP try counter is
   read-then-increment; a revoked till comes back when a user re-enrols the same computer name.

## Portal screens (pass 2)

| Flow                                                       | State kept in                                                  | Steps                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Kiosk                                                      | `screen`, `payment`, `notBilled`, cart, `clientOrderId`        | welcome → menu → paying → done / not billed → welcome (idle timers)      |
| QR order                                                   | `step`, `active`, localStorage saved order, guest              | menu → checkout → payment page → progress → billed / closed / not billed |
| Till billing                                               | ~20 `useState`s; `onlinePayment`; unsent queue in localStorage | editing → online dialog → submitting → done / queued / refused           |
| Online payment dialog                                      | `request` prop, `payment`, `handedBack` ref, polling query     | starting → pending (polling) → paid / expired / cancelled                |
| Unsent bills                                               | localStorage per counter                                       | waiting → sent / refused / discarded                                     |
| Shift end, sign-in, POS gate, TV board, kitchen production | local flags                                                    | —                                                                        |

Findings:

1. **Signing out deletes bills the till has not sent yet** (checked). Sign-out and "signed in
   elsewhere" clear every `aahar.` key except the till keys (`lib/auth-storage.ts:72-88`), and
   the offline queue is `aahar.pos.unsent-bills.<counter>` (`lib/pos-offline-queue.ts:24`).
   Collected money, online-paid bills included, disappears with no record.
2. **A refused bill drops the guest's payment** (checked). After the guest pays, the till sends
   the bill and forgets the payment at once (`billing-page.tsx:1389-1399`). If the server refuses
   it (409: the price changed with the 60 s menu refresh), the toast shows, and pressing Complete
   again starts a new payment: the guest pays twice.
3. **Closing the payment dialog while it is still starting** leaves a live payment polling in the
   background; if the guest pays, it is ignored or attached to the next bill.
4. **Kiosk refresh or crash while paying** loses the payment from the screen; with finding 3 of
   POS, the guest's paid order is never billed.
5. **QR table orders become counter pickup** after a payment-page redirect or "start over"
   (`lib/qr-order.ts:103-115` keeps room but not table).
6. **Ending a shift and pressing Cancel mid-request** leaves the till billing against a closed
   shift until the next refresh.
7. Smaller: kitchen production create-then-post leaves an orphan DRAFT when posting fails;
   device drafts (`aahar.` keys) are also cleared on sign-out; the TV board stops for good on one
   400/404; EXPIRED payments keep polling; the sign-in method can be switched mid-send.

## Sign-in, sessions and master data (pass 2)

| Machine              | State kept in                                                                                                                           | Moves (guard)                                                                                                                                                            | Ends                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Portal OTP           | Redis (`aahar:` keys; in-memory per process without REDIS_URL): code 5 min, cooldown 30 s, tries per code, 10 sends / 15 failures a day | issue: SET NX + atomic counter; verify: count first, then compare, then a DEL only one caller wins                                                                       | all by TTL           |
| Session              | `users.session_version`, refresh key per token (`spent:` marker), access JWT 30 min, refresh 7 days (30-day cap)                        | sign-in bumps the version atomically (new sign-in wins); refresh is read → spend → issue (not atomic, on purpose, for several tabs; reuse after 60 s ends every session) | logout, version bump |
| User                 | `status` ACTIVE / DISABLED, `deleted_at`, `last_active_at` (8 h credential lock)                                                        | last-Super-Admin check under an advisory lock; others read-then-write                                                                                                    | Deleted (no restore) |
| QR guest             | Redis `qr-guest:*` (code, wait, sends, tries) + a signed 30-day token (nothing stored)                                                  | send: SET NX + counter; verify: **read tries → compare → count**                                                                                                         | token expiry only    |
| Masters (~20 tables) | `isActive` + `deletedAt`                                                                                                                | copied per service, no shared helper; delete = read outside the transaction, write by id                                                                                 | Deleted (no restore) |

Findings:

1. **The QR guest code can be guessed in parallel** (checked). `verifyGuestOtp` reads the wrong
   tries, compares, and only then counts (`qr-orders.service.ts:439-448`), so a burst of guesses
   all pass the "fewer than 5" check; only the per-IP throttle limits it. Success gives a 30-day
   token that cannot be revoked, for someone else's mobile, including their staff discount. The
   portal OTP already does this right (count first, then compare).
2. **Dev code `000000` signs in any user** when `NODE_ENV=development` and `ALLOW_DEV_OTP=true`,
   before any counter, even with SMS configured. Two env flags are the only guard.
3. **A user delete racing an edit can put a real mobile or email back on a deleted user**
   (`users.service.ts`: delete reads outside its transaction; both write by id only).
4. **The 8 h credential lock outlives the session**: disabling a user or refusing their refresh
   keeps `last_active_at`, so the admin stays locked out of their contact details; a late
   "last active" write can also land after logout and re-arm it.
5. **Cascades differ per table.** Deleting a restaurant leaves its menu items on the menu list;
   deleting a hospital leaves rooms, menus, prices and restaurant kitchens; deleting a counter,
   restaurant or hospital ignores open shifts. Deactivating never cascades; children are hidden
   when read, and not everywhere (selling ignores Location, LegalEntity, Store and Kitchen; the
   till lookup checks the hospital's `deleted_at` but not `isActive`).
6. **Children are frozen under an inactive parent**: the counter form always resends hospital,
   restaurant and active flag, so every edit of a counter under an inactive restaurant is refused;
   item prices refuse even a deactivation.
7. **Two active item prices can overlap** under concurrent saves (no database constraint).
8. **Names after delete**: category, time slot and role names and every code stay taken. Items
   have no delete, only Inactive (the unused `DELETE /items/:id` route was removed 2026-11-20). An
   employee import treats a deleted employee's code as
   new and then fails.
9. Dead: `rooms.deleted_at` and `item_categories.deleted_at` (no delete endpoint).
