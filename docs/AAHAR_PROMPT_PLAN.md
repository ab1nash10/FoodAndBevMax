# AAHAR — Development Prompt Plan

## Purpose and use

This document converts the outstanding entries in the AAHAR navigation plan into a sequenced set of build prompts. It is written in the same requirement-led style as the TPA prompt reference: every section explains the screen, the data it needs, the business behaviour, and what must be stored or exposed.

Use one section at a time as the implementation brief for the relevant module. A developer must follow the existing AAHAR documentation and codebase conventions, especially the BRD, FSD, ERD, TRD, API specification, security architecture, and implementation plan. This document does not replace those sources.

## Scope status

The source is `aahar dev plan.xlsx`, reviewed on 1 September 2026.

The following entries are explicitly **excluded** because the plan marks them Ready: Hospital/Location, Employee, Item Category, Item Master, Store/F&B, Kitchen, Restaurants, and Item Prices. Do not rebuild or redesign those modules in this workstream. Integrate with their existing APIs, permissions, and tables instead.

The included work is ordered by dependency, not by the worksheet row order. `WIP` items should first be reviewed against their current partial implementation; `Yet to be worked upon` items start as new modules.

## Shared implementation rules for every prompt

- Respect hospital, location, store, kitchen, restaurant, and counter scope. A user must never view or mutate data outside their authorised scope.
- Use the existing role/permission framework, JWT/session protections, audit logging, pagination, validation, standard API response shape, and error handling.
- Keep the stock ledger as the sole source of inventory movement. Never change stock balances directly without writing the related immutable ledger entry.
- Use the current business date and timezone rules. Never use a calendar day as a substitute for an open business day or shift.
- Treat money as decimal values, not floating-point values. Preserve tax, discount, rounding, payment, and reference information needed to reproduce an invoice.
- All create, update, approval, cancellation, void, reconciliation, and integration actions require an audit record with actor, timestamp, old/new values where applicable, and correlation/reference ID.
- Build list, create/edit, detail, validation, permission, API, database migration, test, and user-facing error states together. A screen is not complete when it is only a UI mock-up.
- Reuse the existing master data and do not create duplicate master tables unless the ERD explicitly requires one.

## Section 1 — POS Device Master (WIP)

### Screen 1: POS Device list and configuration

Build or complete the POS Device master. It will allow an authorised administrator to register a physical billing device/counter terminal and make it available to the POS module. The device belongs to one hospital, location, restaurant, and counter; it may optionally be associated with an approved payment machine or integration configuration.

The list must show device code, device name, hospital/location, restaurant, counter, device type, payment-machine reference, active status, last activity, and configuration status. It must support scope-aware filtering, search by code/name/counter, pagination, and an active/inactive filter. An inactive device cannot begin a new bill, but historic bills remain visible.

The create/edit form must capture a unique device code, name, mapped counter, terminal/device identifier, device type, optional IP/network identifier where approved, and active status. Enforce one active device mapping per physical terminal identifier within a hospital. Do not store payment-provider secrets in the browser or plain text.

Store device configuration and its audit trail in the existing counter/POS data model or the approved POS-device extension. Expose APIs for list, read, create, update, activate/deactivate, and device validation for POS sign-in. The POS must validate that its assigned device, counter, restaurant, user, and current shift are all active before a transaction can start.

**Done when:** authorised users can maintain scoped devices; duplicate terminal mapping is rejected; deactivated devices cannot be selected in POS; and all changes are auditable.

## Section 2 — Inventory Operations

### Screen 2: MRP inventory receipt and batch management (WIP)

Complete the MRP inventory workflow for packaged items. An MRP item must be received and issued by batch, with mandatory MRP, purchase price, expiry date where applicable, and quantity. The user should see the item’s batch-wise on-hand quantity, available quantity, reserved quantity, expiry status, and source GRN.

Use FEFO (first-expiry-first-out) when stock is allocated for transfer or sale. Block sale or issue of expired, quarantined, or zero-available stock. Permit only authorised stock adjustments, with a reason code and an offsetting ledger movement. When a user attempts to receive or adjust stock, validate item type, location/store ownership, units of measure, non-negative quantities, batch uniqueness in context, expiry rules, and business-date availability.

Create the API and UI paths for batch inventory lookup, batch-level stock history, and authorised stock adjustment. The output must integrate with GRN, store stock, transfers, restaurant stock, billing, and discard/wastage; it must not create an isolated MRP balance.

**Done when:** MRP stock is traceable from receipt through consumption or transfer, FEFO allocation is deterministic, and every movement is present in the stock ledger.

### Screen 3: Readymade production and daily stock (WIP)

Complete the Readymade workflow for food prepared in a kitchen and distributed to restaurants. A production entry must select kitchen, production date/business date, prepared item, quantity, unit, batch/production reference, prepared-by employee, and optional expiry/use-by time. It must create available stock at the kitchen and an immutable production record.

The screen should provide production list and entry views, filters for kitchen/date/item/status, and a detail view showing transfers, acknowledgement, wastage, and remaining balance. Only valid readymade items may be produced. Prevent use of future business dates and prevent a production record from being edited after stock has been transferred or sold; use a controlled reversal instead.

Readymade stock is daily stock. At day end, remaining quantity must be routed through approved carry-forward, discard, or wastage policy rather than silently remaining available. Integrate the output with Kitchen Production, Transfers, Restaurant Stock, Billing, Shift End, Day End, and reports.

**Done when:** production increases kitchen stock through the ledger, transfers preserve traceability, and unhandled readymade stock cannot bypass day-end rules.

### Screen 4: Live-item preparation and availability (WIP)

Complete the Live item workflow for items made on demand. Live items do not require a saleable packaged batch or normal pre-produced restaurant stock. Their availability is governed by item setup, restaurant menu mapping, active time slot, kitchen capability, and manual availability toggle.

The screen must allow an authorised restaurant or kitchen user to see live items applicable to their scope and set a temporary available/unavailable state with a reason and optional effective-to time. It must show the current menu/time-slot availability and prevent toggles for inactive item, restaurant, kitchen, or menu mappings. POS and QR ordering must read this single availability result; they must not each maintain a separate availability flag.

Where the recipe/ingredient model is introduced later, reserve ingredients only through the inventory engine. Until then, do not fabricate stock deduction for a live item unless the approved item configuration supports it.

**Done when:** the same live-item availability is returned to POS and customer ordering, all changes are scoped and audited, and invalid menu/time-slot combinations are rejected.

### Screen 5: Goods Receipt Note (GRN) (not started)

Build the GRN module for receiving MRP inventory into a Store/F&B location. The GRN list must show GRN number, vendor, store, receipt date/business date, status, invoice/challan reference, total quantity/value, and receiving user. Users must be able to filter by hospital, store, vendor, date range, status, and GRN number.

The create GRN screen must select a valid store and vendor, capture supplier document references, and add one or more MRP item lines. Every line must capture item, received quantity, accepted/rejected quantity, unit cost, tax, MRP, batch number, manufacturing/expiry details as required, and remarks. Support partial receiving against a purchase order when a PO is available; do not make a PO mandatory unless the configured procurement policy requires it.

Use draft, posted, cancelled, and reversed states. Posting must be transactional: validate all lines, create GRN/batch records, create stock-ledger entries, and update read models together. Cancellation or correction after posting requires a reversal that preserves history; never delete a posted GRN. Block duplicate supplier invoice references according to vendor/store policy.

Create APIs for list, detail, draft, line editing, post, cancel/reverse, and printable/downloadable GRN. Implement permission boundaries between creator, receiver, and approver where enabled. Include tests for partial receipt, duplicate batch, invalid expiry, duplicate invoice, failed post rollback, and reversal.

**Done when:** a posted GRN creates auditable batch-level store stock that is immediately available for valid downstream transfers and cannot be changed by editing the original receipt.

### Screen 6: Stock dashboard and adjustments (not started)

Build a scope-aware Stock screen with a summary and detailed inventory ledger. It must display on-hand, reserved, available, in-transit, expired/quarantined, and valuation amounts as appropriate for MRP, Readymade, and Live item rules. Users can filter by hospital, location, store/kitchen/restaurant, item, category, item type, batch, and date range.

The detail view must show every source movement: GRN, production, transfer out, transfer acknowledgement, sale, cancellation/refund, wastage, adjustment, and day-end action. It must expose reference links to the source records. The balance shown must reconcile to the ledger; do not calculate a second independent balance in the UI.

Provide controlled stock adjustment only to authorised roles. The form requires inventory scope, item/batch where applicable, quantity/direction, reason code, supporting note, and approval/reference according to policy. Quantity cannot make the available balance invalid. Use an adjustment ledger event and an audit log, then surface it in reporting.

**Done when:** dashboard totals trace to ledger entries, adjustment is permissioned and reversible through a compensating entry, and users cannot query another hospital’s stock.

### Screen 7: Transfer and restaurant acknowledgement (not started)

Build the unified transfer workflow for Store-to-Restaurant, Kitchen-to-Restaurant, and Restaurant-to-Restaurant movement. The transfer list must show transfer number, source, destination, item type, business date, status, created-by, dispatched/acknowledged timestamps, and exception status.

The create screen must require compatible source and destination scopes, then allow valid items/batches and quantities to be selected from available source stock. MRP allocation follows FEFO. Readymade allocation must retain its production reference and daily-stock attributes. A transfer cannot exceed available quantity and cannot transfer to the same inventory node.

Submitting a transfer must reserve or mark stock in transit according to the approved inventory state model. Receiving restaurant users must see a pending acknowledgement queue, verify each line, accept full/partial quantity, record short/excess/damaged discrepancies with reason, and submit acknowledgement. The final acknowledgement posts the destination stock and records any variance as the approved ledger event. Reject/cancel and return flows must preserve the chain of custody.

Implement APIs for create, list, detail, dispatch, pending acknowledgements, acknowledge, cancel/reject, and return where supported. Send notifications for pending or overdue acknowledgement. Include tests for FEFO, insufficient stock, partial acknowledgement, duplicate acknowledgement, cross-hospital attempt, and transfer reversal.

**Done when:** every transfer has a source, destination, lifecycle, line-level acknowledgement, and ledger trail; restaurant stock only becomes saleable after the appropriate acknowledgement.

## Section 3 — Restaurant Configuration (WIP)

### Screen 8: Restaurant Menu mapping

Complete the Restaurant Menu master. It connects an active restaurant to sellable items, category/order position, item prices, time slots, availability, tax/GST classification, FSSAI/food information where configured, and the order channels allowed for the item.

The menu list must be filterable by restaurant, category, item, channel, active state, and effective date. The edit screen must not create a duplicate active mapping for the same restaurant-item-channel-effective period. It must validate that the item and category are active, that a price exists for the relevant restaurant/date, and that any time-slot mapping is valid.

Provide scheduled effective dates, sorting/display sequence, channel flags (POS, QR, employee/mobile, in-room/bedside when enabled), and a clear manual availability override reference. Do not duplicate the live-availability flag: query the central availability service/result. Menu activation/deactivation must retain historic invoice/menu references.

**Done when:** a restaurant’s active menu returns only items with a valid current price, time-slot status, and availability for the requested channel.

### Screen 9: Time Slot master

Complete the Time Slot master used by menus, POS, billing, and invoice/reporting. A time slot must have a unique scoped code/name, start time, end time, applicable day(s), active flag, and optional effective dates. Support overnight slots correctly, for example 22:00–02:00.

The list must show active state and current applicability. The form must validate no ambiguous overlapping active slots for the same restaurant/use case unless overlapping is intentionally allowed by configuration. The resolver must work from the business timezone and business date, not the browser timezone.

Expose an API that resolves the active slot for a restaurant and timestamp, and use it from menu availability and billing. Time-slot changes must be audited and must not rewrite historic invoice results.

**Done when:** an item is reliably available or unavailable at slot boundaries, including overnight slots, and historic reports remain stable.

### Screen 10: Discount rules and approvals

Complete the Discount master for normal, staff, promotional, and authorised manual discounts. A rule needs code/name, type, fixed/percentage calculation, maximum amount/percentage, effective dates, applicable hospital/location/restaurant/counter/channel/item/category, minimum order amount, stackability, approval requirement, and active status.

The billing flow must evaluate only eligible active rules and return an explainable result: applied, not applicable, exceeded cap, missing employee validation, or pending approval. A manual discount must require reason and, where configured, supervisor approval before payment. Staff discount must validate the selected employee and eligible entitlement without exposing employee data outside scope.

Create an approval queue for approvers to approve/reject with reason. Capture the rule snapshot, approval identity, and computed discount on the invoice so later rule edits cannot change a completed bill. Prevent discount value from making the payable amount negative unless a separately authorised complimentary flow is implemented.

**Done when:** discount selection is deterministic and auditable, approvals are enforced before finalisation, and invoice snapshots reproduce the exact discount calculation.

## Section 4 — Ordering Channels

### Screen 11: POS order capture (not started)

Build the operator-facing POS screen for counter orders. Before opening a cart, validate login, device, counter, restaurant, permissions, and open shift. Load only the restaurant’s active, channel-eligible menu with current prices, tax, time-slot, and availability. Provide category navigation, search, item modifiers/notes when configured, quantity controls, cart summary, customer/bed/employee reference capture where applicable, and clear out-of-stock feedback.

Creating or editing a cart must not yet create a final invoice. The POS should create an order in a controlled draft/pending-payment state, reserve stock only where the order engine policy requires it, and show an idempotent order reference. Remove a line or abandon a draft through a state transition; do not leave silent reservations.

The POS must support only its configured channels and payment modes. It may offer normal and approved discount flows. It must send accepted food orders to KOT after the defined payment/order status rule, and must never allow the same retry to create a duplicate order or duplicate payment.

**Done when:** an authorised operator can create a scoped order from valid menu items; unavailable items cannot be added; retries are idempotent; and the resulting order is ready for the billing/KOT workflow.

### Screen 12: QR customer ordering (not started)

Build a customer-facing QR ordering flow. A signed, non-guessable QR URL identifies the hospital, restaurant, and table/room/bed context permitted by configuration. The page must show the relevant live menu, current availability, price/tax display, dietary/FSSAI information when configured, cart, order notes, and payment handoff.

The customer must not gain administrative access, learn internal identifiers, or change the encoded restaurant/table scope. Validate QR expiry/activation, restaurant status, active time slot, menu eligibility, and availability on both display and order submission. Apply rate limiting and abuse protections to public endpoints.

Create a guest order source with a customer-facing order tracker. Payment confirmation must come from verified backend callbacks/status checks, not a browser redirect alone. Failed/abandoned payment must leave an intelligible order state and safely release any reservation according to policy. QR orders flow into the same common order engine, billing, KOT, payment, and reporting data model as POS.

**Done when:** a valid QR can create one secure customer order in the common order engine, invalid/expired QR codes are rejected, and payment/order state cannot be forged from the client.

### Screen 13: Employee mobile application ordering (not started)

Build the authenticated employee ordering channel as a responsive mobile web application/PWA unless native mobile is separately approved. An employee signs in through the approved identity flow, sees restaurants and menu items authorised for their hospital/location, and can place an order using the same menu, availability, discounts, order, KOT, payment, and tracking services.

If employee/staff discounts are enabled, resolve eligibility server-side from the employee master and discount policy. Do not trust an employee number provided by the client. Support order history, active-order tracking, cancellation requests subject to status policy, and e-bill delivery preference.

The interface must remain usable on a small screen, recover safely after network interruption, and never persist payment credentials locally. Push/browser notifications are optional until their consent, delivery, and fallback requirements are approved.

**Done when:** an authenticated, in-scope employee can place and track an order without creating a parallel order or pricing system.

## Section 5 — Billing, KOT, and Operational Close

### Screen 14: Billing and invoice finalisation (not started)

Build the billing workflow that receives an eligible order/cart from POS or the common order engine. The bill preview must show line prices, quantity, taxes/GST, discounts, rounding, payment split, payer/customer reference, order source, restaurant/counter/device, and payable total. Recalculate all totals on the server immediately before payment/finalisation.

On successful, verified payment—or an authorised cash/credit/complimentary path—create an immutable invoice and invoice lines with sequential, scoped invoice number. Record the exact price, tax, discount, and master-data snapshots used. Post stock consumption only once and only according to the item-type/order policy. Trigger KOT only through the approved order status transition, preventing duplicate tickets.

Support cancellation, void, refund, and correction as stateful, permissioned workflows. A completed invoice is never edited or deleted. Each exception must reference the original invoice/order, require reason and approval where configured, write compensating financial/inventory records, and be visible in reconciliation and audit reports. Provide printable and e-bill output using a stable invoice representation.

**Done when:** the same bill cannot be finalised twice, invoice totals are reproducible, payment and stock states reconcile, and every exception preserves the original history.

### Screen 15: Kitchen Order Ticket (KOT) and order tracker (not started)

Build the KOT screen for kitchen teams and the companion order tracker display. Accepted orders create KOTs grouped by kitchen/production route according to menu-item configuration. A KOT must show unique number, order/invoice reference, restaurant/table/room context as permitted, items, quantities, notes/allergens, timestamp, priority, and status.

Kitchen users must view only their scoped queue and update ticket/line status through configured states such as New, Accepted, Preparing, Ready, Served/Handed Over, Cancelled, and Rejected. Enforce valid transitions and record the user and timestamp of every transition. The tracker is read-only, presents a privacy-safe order identifier, and refreshes from server state rather than exposing kitchen data to a browser.

Handle amendment and cancellation carefully: an unstarted line may be cancelled under policy; an in-preparation or completed line must create a clear exception/approval event rather than silently disappear. KOT retries and print/display notifications must be idempotent.

**Done when:** every eligible ordered food line has a traceable KOT lifecycle, kitchen status updates are visible to the correct operator/tracker, and changes are auditable.

### Screen 16: Shift End (not started)

Build Shift End for counter/POS operations. A shift is opened for a permitted user, device, counter, and business date. End shift must show expected sales and payment totals by mode, cash drawer expected amount, recorded cash count, open orders, pending payments, KOT exceptions, and handover/forwarded readymade stock where required.

The closing user must enter actual counts and discrepancy reasons. Do not allow a shift to close while payment attempts are unresolved, while there are pending bills requiring operator action, or while required handover steps are incomplete. The system may hand over authorised stock/control to the next shift, but it must record the source shift, receiving user, time, and quantity.

Store shift summary, payment summary, discrepancy, handover, and approvals as immutable closing data. An authorised supervisor may reopen only under controlled policy with audit history; normal users cannot alter a closed shift.

**Done when:** each device/counter shift has expected-versus-actual reconciliation, outstanding work is explicit, and the next shift inherits only approved handover data.

### Screen 17: Day End (not started)

Build Day End at the configured restaurant/location scope. It aggregates closed shifts, billing/payment totals, stock events, pending transfers, readymade stock handling, wastage, and unposted exceptions for the business date. The user must see a checklist and cannot close the day until blocking exceptions are resolved or formally approved.

Day End must finalise daily readymade stock according to policy, lock normal operational posting for the completed business date, create day-close records, and prepare data for payment reconciliation, supervisor approval, ERP/SUN export, and reports. It must not alter historical invoices or ledger entries.

The user must be able to view close status, blocking reasons, approver comments, and a final day summary. A reopening/reversal flow requires elevated approval, explicit reason, and full audit logs.

**Done when:** the business date closes once per scope, all dependent operational data is accounted for, and post-close changes are controlled rather than silent.

## Section 6 — Payments

### Screen 18: Payment modes master (not started)

Build the Payment Modes master used by POS, billing, restaurant configuration, reconciliation, and reports. A payment mode has code/name, type (cash, card, UPI, wallet, online gateway, bank/credit, complimentary where approved), active status, allowed restaurant/counter/channel scope, tender rules, external integration requirement, and reconciliation behaviour.

The master must allow authorised configuration but must prevent removal of a mode referenced by historic payments. Deactivation stops new tender selection without changing historic bills. Define whether a mode supports split payment, refund, manual reference, and operator cash count.

The billing API must return only eligible active modes for the current order/device/counter. Validate payment-mode rules on the server; do not rely on the POS UI hiding a button.

**Done when:** payment modes are centrally configured, scope-aware, safely deactivated, and consistently enforced across ordering channels.

### Screen 19: Payment integrations (not started)

Build a provider-agnostic payment integration layer for Pine Labs, Razorpay, PayU, and later approved providers. The administration screen must configure non-secret provider metadata, scoped merchant/terminal mapping, active status, and test/production mode. Store secrets only in the approved secure secret store/environment; never expose them in APIs, logs, client bundles, or database views.

Create a payment attempt for every initiated transaction with order/invoice context, provider, idempotency key, requested amount, terminal/merchant reference, status, and timestamps. Handle initiation, provider redirect/device callback where required, signed webhook ingestion, status polling/retry, success/failure/cancellation/timeout, and refund. Verify webhook signatures, deduplicate events, and use the provider transaction ID exactly once.

The billing service is the authority for settlement. A client-side success message or return URL cannot mark an invoice paid. Ensure a payment retry cannot charge twice, and ensure a delayed callback cannot apply payment to a cancelled/changed invoice without validation. Surface clear operator recovery guidance for unknown/pending payment status.

**Done when:** each provider transaction has an idempotent attempt/event trail, verified settlement updates exactly one business payment, and reconciliation can compare internal and provider references.

## Section 7 — Closing and Reconciliation

### Screen 20: Shift Closing workbench (not started)

Build the Shift Closing workbench as the operational dashboard for an individual counter/device shift. It should consolidate billing totals, payment-mode totals, payment attempts, cash count, refunds/voids, KOT/order exceptions, cashier handover, and mismatch indicators. It is the detailed working screen behind the Shift End process.

Provide drill-down links to invoices, payments, attempts, adjustments, and audit trail. Let eligible users record counted cash and notes; let supervisors record or resolve discrepancy decisions. Do not permit users to alter invoice/payment source data from this workbench.

**Done when:** an operator can reconcile a shift from source records, and each mismatch is visible, explained, and assigned a controlled resolution.

### Screen 21: Day Closing workbench (not started)

Build the Day Closing workbench for supervisors. It aggregates all restaurant/counter shifts under its scope and displays business-date readiness: closed/open shifts, expected versus actual tenders, pending provider events, refunds, payment mismatch, inventory/day-end exceptions, and supervisor approvals.

The supervisor can approve, reject, or return a close package with comments. Approval must be recorded separately from preparation and must use permissions. Rejection reopens only the required corrective workflow and does not destroy the submitted close snapshot.

**Done when:** a supervisor can make a defensible, auditable day-close decision from reconciled underlying data.

### Screen 22: Payment reconciliation (not started)

Build Payment Reconciliation for comparing internal payments against payment gateway settlement/terminal/bank data. Support secure import or API retrieval of provider settlement data, with file/version/source metadata, row-level validation, and duplicate-import prevention. Map records through stable provider transaction, merchant/terminal, date, amount, and payment-mode references.

The reconciliation screen must show matched, unmatched internal, unmatched provider, amount mismatch, duplicate, pending, and manually resolved states. Users can filter by business date, provider, restaurant, counter, payment mode, settlement batch, and status. Manual matches/resolutions require reason, supporting reference, authorised role, and audit data; automatic matching rules must be explainable.

Do not alter original payment records to force a match. Store reconciliation result and adjustment/exception links separately. Feed unresolved mismatches into shift/day closing and reports.

**Done when:** the system can prove how each payment was matched or why it remains exceptional, without overwriting source transaction history.

### Screen 23: Supervisor approval queue (not started)

Build the Supervisor Approval queue for controlled exceptions: discount approvals, void/refund approvals, stock adjustment approvals, shift/day close approvals, and reconciliation exceptions. The queue must display type, source reference, scope, requester, amount/impact, created time, supporting notes, SLA/age, and current status.

Approvers can approve, reject, or return with mandatory comments where policy demands. Enforce segregation of duties: a requester must not approve their own request unless an explicit emergency policy is approved and logged. Approval actions must be idempotent and notify the requester/next responsible role.

**Done when:** every approval-dependent action is blocked until an authorised, auditable decision exists, with a clear source-record link.

## Section 8 — Reports and ERP/SUN

### Screen 24: Location-wise reports (not started)

Build a location-wise reporting entry screen. Users can select only authorised hospital/location/store/kitchen/restaurant scope and apply date/business-date, item type, category, channel, payment mode, and status filters. Reports must use server-side filtering, pagination/export limits, and a documented data cutoff/timezone.

Initial report outputs should include sales summary, item-wise and day-wise sales, in-house consumption, inventory/GRN/production/transfer movement, payment/reconciliation, closing, tax/GST, and wastage where data exists. Each row must provide drill-down to its source record subject to permission. Exports must be queued/secured when large, time-limited, and audit logged.

**Done when:** a scoped user can obtain accurate location-filtered operational and financial reports without access to other hospitals’ data.

### Screen 25: Report type master (not started)

Build a Report Type master that registers approved report definitions and controls visibility by role/scope. Define report code/name, category, description, parameters, output columns, allowed formats, active state, required permission, and data-source version. It must include at least Sales Report, Item-wise Sales Report, Day-wise Item Sales Report, In-House Consumption Report, IHC Item-wise Sales Report, IHC Day-wise Sales Report, and Tax Report.

Do not allow users to enter arbitrary SQL or executable code. Report definitions must use approved server-side query builders/views and be versioned. Deactivating a report stops new generation while retaining export/audit history.

**Done when:** report availability is configuration-driven, permissions are enforced, and each generated output records its definition version and filter inputs.

### Screen 26: Restaurant-wise reports and audit explorer (not started)

Build restaurant-wise reports for sales, inventory, GRN, production, transfers, payment, and closing. Provide comparative summary cards and drill-down into source invoices, ledger entries, transfer acknowledgements, KOTs, and close packages. All totals must use the same status and business-date rules as the operational modules.

Build the Audit explorer alongside it. It must allow authorised users to filter audit events by time, actor, role, module, action, entity/reference, hospital/location/restaurant, and correlation ID. Display safely redacted before/after values, source IP/device context where retained, and a link to the affected business record. Audit data is read-only and must not be editable from the UI.

**Done when:** a permitted auditor can trace a report figure back to its operational source and an important business action back to its actor and timestamp.

### Screen 27: ERP / SUN export (not started)

Build the ERP/SUN integration workbench for approved transactions only. It must prepare export batches for configured entities such as sales/invoices, tax, payments, inventory movements, GRNs, wastage, and closing summaries. Each batch needs export type, scope, business-date range, record count, status, schema/version, generated file or transmission reference, attempts, response/error details, and retry eligibility.

Only approved/reconciled/closed data may be exported according to business rules. Use an outbox/queue pattern with idempotency keys so retries never duplicate ERP posting. Do not mark internal data as exported merely because a file was generated; record acknowledged success from the integration path. Failed records must be diagnosable and retryable without re-exporting successful records.

The UI must support batch list, detail, validated generation, secure transmission/download where approved, retry, and error drill-down. Credentials and endpoint secrets must be server-side only. Build integration contracts and test stubs before enabling a production endpoint.

**Done when:** every ERP/SUN export is traceable, repeat-safe, limited to approved data, and reconcilable to source records and external acknowledgement.

## Cross-module acceptance checklist

- Required migrations, APIs, UI, permissions, validation, audit events, and automated tests are delivered together.
- Role and hospital/location/restaurant scoping are validated in the service layer and covered by tests.
- Transactional flows have idempotency/retry behaviour and do not duplicate stock, payments, invoices, KOTs, transfers, or ERP exports.
- All business-state transitions are explicit; completed financial, inventory, and closing records are immutable and corrected only by approved compensating records.
- Error messages are useful to operators but do not expose secrets, internal identifiers, or unauthorised data.
- New modules have list/detail/search/filter/empty/loading/error states and usable audit/report links.
- The full relevant test suite, linting, type checking, and migration validation pass before marking the navigation item Ready.

## Recommended delivery sequence

1. Complete POS Device, MRP, Readymade, Live, Restaurant Menu, Time Slots, and Discounts where the current WIP implementation exists.
2. Deliver GRN, Stock, and Transfers/Acknowledgements as one inventory slice.
3. Deliver POS plus Billing and KOT as one controlled counter-order slice.
4. Add Payment Modes and provider integrations, then Shift End/Day End.
5. Add QR and Employee Mobile ordering through the same common order engine.
6. Deliver reconciliation, supervisor approval, reporting/audit, and ERP/SUN export last, after their source records exist.
