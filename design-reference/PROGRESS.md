# AAHAR UI v2 — progress

Spec: the `*.dc.html` mockups in this folder (file → route map in `README.md`). Portal:
`frontend/apps/admin-portal`. Each task is one commit.

## Tasks

- [x] T0 Tokens & base styles
  - Plan: themed `--ds-status-*`, `--ds-tile-*`, `--ds-food-*`, `--ds-selected` (dark #0C2238)
    and `--ds-card-shadow` in `app/globals.css`, mapped in `tailwind.config.ts`
    (`ds-status-{pending,info,ok,bad,neutral}-{bg,fg}`, `shadow-card`); sidebar 248px; type
    scale (titles 24/800, section titles 15/800, tabular numbers). Then rename the old
    `ds-pending/received/rejected/transit` classes to the status tokens and delete every
    hand-written `dark:bg-amber-950`-style override across the portal.
  - Done: 45 class renames, 69 redundant dark shades removed, the remaining raw palette
    colours (session notice, notification categories, POS tabs, error pages…) mapped to
    tokens; 0 coloured `dark:` overrides and 0 raw hex left in components. Neutral chips use
    `status-neutral`; cards use `shadow-card`; table cells are tabular-nums.
- [x] T1 Shared components
  - Plan: static pieces in `components/design-system.tsx` (StatusChip, TypeTag, Stepper,
    Timeline, KeyboardHint, SummaryCard, DetailSection), interactive ones in
    `components/ui-controls.tsx` (SegmentedControl, SavedViewTabs, FilterBar + FilterSearch +
    FilterSelect, BulkActionBar, DetailPanel); status labels/tones as data in `lib/status.ts`.
  - Done. `lib/status.check.ts` asserts every status enum in `prisma/schema.prisma` has a
    chip. StatusChip replaced the old regex-guessing StatusBadge and the transfers page's own
    label/colour maps; GRN, stock and production badges now use it; the transfer details use
    Timeline. SavedViewTabs supports arrow/Home/End; DetailPanel closes on Esc.
- [x] T2 App shell
  - Plan: rebuild the sidebar and top bar in `components/admin-shell.tsx` from Sidebar.dc.html
    and Topbar.dc.html, reusing the existing navigation config, permissions, location
    selector, notifications and profile menu.
  - Done. Module groups fold open one at a time (the active module opens on route change),
    and the collapsed rail keeps icons with dot badges. Badges count work waiting in each queue
    (transfers pending ack, GRNs under verification, draft productions) with `limit: 1` list
    calls keyed under `['dashboard', …]`, so the existing invalidation refreshes them. The
    footer has a Max Healthcare card and "Search & shortcuts". The top bar has a breadcrumb
    built from sidebar labels, a palette search (fires `aahar:open-command-palette`, picked up
    in T3), the location selector, New transfer (with the create permission only), the bell,
    the theme toggle and the account menu. Labels collapse to icons below 1280px. On phones the
    theme toggle and New transfer hide (Preferences and the page buttons cover them). No
    sideways scroll at 1440/1280/1100/1024/860/768/390. Esc closes the phone drawer.
- [x] T3 Command palette
  - Plan: `components/command-palette.tsx`, mounted once in AdminShell, opened by Ctrl/Cmd+K,
    the top bar search and the sidebar's "Search & shortcuts" (`aahar:open-command-palette`).
    The shell passes the permitted sidebar pages so the palette never sees a page the user
    can't open.
  - Done. Groups are Results (transfers, GRNs and items whose number, code or name match,
    through the lists' existing `search` parameter, scoped to the selected location, 3 each),
    Recent (the last 3 records opened from the palette, in this browser), Create (New transfer
    / GRN / kitchen production, each behind its create permission) and Go to (Dashboard,
    Transfers, Items, Kitchen Production; any permitted page when searching). It is an ARIA
    combobox + listbox: arrows wrap, Enter opens, Esc closes and gives focus back, and Tab stays
    in the search box. N→T/G/P and G→D/T/I/P work outside inputs and dialogs, within 1.2s.
    New `ds-overlay` token (alpha in the variable, deeper in dark) now backs every dialog
    backdrop; the old `bg-ds-text/50` washed dark mode out in white.
- [x] T4 Login
  - Plan: rebuild the markup of `app/(auth)/auth/login/page.tsx` from Login.dc.html and keep
    its logic as is (zod schemas, the three mutations, start-page redirect, session-expired
    toast, mobile = OTP only / email = password only).
  - Done. Brand panel (new `ds-brand-panel` token: primary blue in light, surface in dark;
    logos on `ds-logo-chip`) from 1024px up, with a compact logo row below that instead of
    stacking the whole panel above the form. The method switch is SegmentedControl (new
    `size="lg"`). Email has show/hide password (aria-pressed) and `username` /
    `current-password` autocomplete. Mobile has a +91 prefix and `tel-national`. Errors appear
    on the first submit, then update as you type. The OTP step is six boxes: typing moves on,
    Backspace moves back, arrows move, paste or SMS autofill (`one-time-code` on box 1) fills
    all. "Resend in 0:30" counts down, then becomes "Resend code". Toasts now use the status
    tokens (they were raw emerald/red/blue). The default method stays Mobile OTP, as before.
- [x] T5 Dashboard
  - Plan: rebuild `components/organization/dashboard-overview.tsx` from Dashboard.dc.html with
    the existing list APIs only (no new endpoints); every part stays behind its view permission
    and every query key sits under `['dashboard', …]` so the existing invalidation refreshes it.
  - Done. Header with date · Max Healthcare · location, greeting, a Today / 7 days / 30 days
    switch and "Review pending (n)". Four KPI tiles: pending acknowledgements (oldest age,
    restaurants waiting), transfers in range (acknowledged · partial · open), GRNs to verify
    (partially accepted · store), production posted in range (open drafts · wastage %).
    "Needs your action" merges pending transfers, GRNs under verification or partially
    accepted, and draft productions, oldest first per type. It has filter chips with totals,
    the age (oldest in amber) and an Acknowledge / Verify / Review / Post link. Expiring soon is
    stock balances expiring within 7 days, soonest first. Recent activity is the latest
    transfer / GRN / production changes. Quick create reuses the palette's create commands and
    their N-then shortcuts. Master data is the compact 2-column grid. Transfer routes show
    location names via the new `components/inventory/use-locations.ts` (moved out of
    inventory-pages; same query keys). `KpiCard` was removed (no longer used).
- [x] T6 Transfers list
  - Plan: rebuild the list half of TransfersPageClient from Transfers.dc.html on the T1
    pieces (SavedViewTabs, FilterBar, BulkActionBar, DetailPanel). The open transfer moves
    into `?id=`. The acknowledgement sheet is left alone for T8.
  - Done. Saved views All / Draft / Pending acknowledgement / Acknowledged / Cancelled show
    live counts under the current filters. The filter bar has search, location (only when the
    top bar is on All locations), From type (plus a specific store/kitchen once a location is
    chosen), To restaurant, Date (today, 2, 7 or 30 days) and Sort. Rows have checkboxes;
    ticking swaps the filters for a bulk bar (Export CSV, Clear). The header Export downloads
    the page. The status column adds an outcome line: Accepted in full / partially / Rejected
    in full (read from the lines' accepted and rejected totals), Waiting on restaurant, Not
    dispatched, or the cancel remarks. Pagination reads "Showing 1–10 of 42" with icon
    buttons. The docked panel shows From/To cards, business date, remarks, lines (sent /
    accepted / rejected, near-expiry batches in red, rejection reasons), a timeline, and
    actions: Dispatch / Cancel for drafts; Accept in full / Check quantities / Reject in full
    for pending. `?id=` opens it from any link (fetched alone if not on the page; "Transfer
    not found" otherwise). Esc or ✕ closes it and puts focus back on the row. On narrow
    screens it scrolls into view. CSV export (`lib/csv.ts`, self-check `lib/csv.check.ts`)
    neutralises formula cells. Native controls follow dark mode (`color-scheme`).
- [x] T7 New transfer
  - Plan: rebuild CreateTransferPageClient from NewTransfer.dc.html and keep its save rules
    as they were: zod header schema, FEFO allocation, the kitchen business-date checks, and
    the final per-batch "never more than available" check.
  - Done. Route step: Store | Kitchen and Restaurant | Counter switches (Counter is shown
    disabled, see TODO(api)), source / restaurant selects, transfer date & time, business
    date. Items step: a search combobox over what the source holds (arrows + Enter add the
    item and jump to its quantity). "Often sent to this restaurant" chips come from its last
    10 transfers. Each line shows the FEFO batch (+n more when a quantity spans batches) with
    a FEFO tag and "Change" to pin one batch, live available quantity, the send quantity, and
    live checks ("Only 473 available…", empty quantity after a submit attempt, near-expiry
    and already-expired batch warnings). Sticky summary: from, to, lines, batches, ok / needs
    attention, what submitting does, and the shortcuts. Sticky action bar: Discard, Save draft
    (Ctrl S), Submit for acknowledgement (Ctrl Enter). Submit creates and dispatches; both
    open the transfer in the list (`?id=`). Unsent work autosaves to this browser ("Draft kept
    on this device · 12:41") and comes back on return. It is cleared on save, submit or
    discard.
- [x] T8 Acknowledge
  - Plan: replace the transfers page's slide-over acknowledgement sheet with a page,
    `/inventory/transfers/[id]/acknowledge`, built from Acknowledge.dc.html. It uses the same
    `createTransferAcknowledgement` call and line rules (accepted + rejected = sent, a reason
    for anything rejected).
  - Done. Header: back link, "Acknowledge TRF…", "Pending acknowledgement · 1h 05m", and a
    from / to / sent / remarks strip. Lines: item · batch, sent, an accepted stepper
    (QuantityStepper gained `compact` and `id`), rejected worked out live, and a reason select
    (Short received, Damaged in transit, Quality issue, Expired or near expiry, Wrong item
    sent) that appears once anything is rejected and is required. Row icon and tint show in
    full / partly / rejected. Accept all and Reject all set every line. The Outcome card maps
    to ACCEPTED_FULL / ACCEPTED_PARTIAL / REJECTED_FULL with what happens to the stock, plus
    in-full / partial / rejected counts, remarks for the store, a confirm button named for
    the outcome, and the "Stock moves as soon as you confirm…" note. Confirm stays disabled
    without TRANSFER_ACKNOWLEDGE. A bad line moves focus to it. Typed quantities survive a
    refetch. A transfer that is not pending shows its outcome and a link back. It works at
    tablet width (1024, 768): the outcome card drops under the lines. The transfers panel's
    pending footer is now one "Acknowledge" button to this page. The dashboard's Acknowledge
    tasks link straight here.
- [x] T9 GRN verification
  - Plan: open a GRN at `/inventory/grns?id=` as the verification screen from Grn.dc.html,
    using the existing update (PUT), post-to-stock and cancel calls. Batch-level rules mirror
    the backend: accepted + rejected = received per batch, line totals equal batch totals,
    and an expired batch can't be accepted.
  - Done. Header: back link, GRN number, status, vendor → store · received … by …, and Reject
    GRN (cancel, behind a confirm), Save verification, and Accept & post to stock (says "Accept
    partially & post" when anything is rejected). It needs GRN_UPDATE (+ GRN_POST to post).
    A stepper runs Received → Verification → Accepted / Partially accepted → Posted to stock.
    Lines: expand to batches (mfg, expiry, near-expiry or Expired tags, received, accepted).
    Accepted is typed on the line for one batch and per batch for several. Rejected is worked
    out, and a reason select is required once anything is rejected. Errors focus the
    offending input. Totals sit at the foot. Side: receipt details; a "Before you post"
    checklist (posting with unticked checks asks to confirm); a FEFO note for batches expiring
    within 7 days. Posted or cancelled GRNs open read-only. List rows now link to the GRN
    with Verify (drafts) / View; posting and rejecting happen after verification. Delete stays
    for drafts. The table uses tokens.
- [x] T10 Items
  - Plan: replace the items card grid with Items.dc.html's table and a docked panel, keeping
    the existing list query, edit form (ItemFormFields + zod), status toggle (with its
    confirm) and delete.
  - Done. Filter bar: search, a food-type switch (All / Veg / Non-veg / Egg), Type, Category,
    Status and Sort. Table: food marker, name (button) with code · HSN, category, item-type
    tag, today's Normal price (base price, location-scoped; "₹80+" when it varies by
    location), and an Active toggle. The empty state has Clear filters. The footer reads
    "Showing 1–25 of n items" with a Rows 25/50/100 select and pager. `?id=` opens the panel:
    Prices (prices in effect today per rate type, restaurant overrides, tax-inclusive flag,
    link to Item Prices), Details, and Mapping (store and kitchen mappings plus restaurant
    menus with slots, each behind its view permission). Footer: Edit details (the existing
    form inside the panel) and Delete. Esc / ✕ close it and focus goes back to the row.
- [x] T11 Kitchen production
  - Plan: replace the create form with Production.dc.html's entry view (ProductionEntryPage
    Client), used for `/kitchen/productions/new` and for `/kitchen/productions?id=` (the
    board, the palette and the dashboard's Post tasks link there). It keeps the zod header and
    line schemas and the mapped-READYMADE-item rule. Drafts save through the existing update
    (PUT).
  - Done. Header: number (or "New production"), status, kitchen · location · chef, and Save
    draft / Post to kitchen stock (save then post) / Cancel production, each behind its
    KITCHEN*PRODUCTION*\* permission. A "Today · 2 Oct" list of the location's productions
    (number, kitchen, time or "posted 12:31", status; + for new). Fields: kitchen, produced
    at, business date, remarks. Lines: produced and wastage inputs; accepted = produced −
    wastage, worked out; a waste % pill. Lines above `WASTAGE_ALERT_PERCENT` (5) are tinted
    and their wastage field outlined. Chips add the kitchen's mapped items (first 6, then a
    "+ n more…" select). Totals: items, overall wastage, lines above the limit. A posting note
    explains what happens. Posted and cancelled productions open read-only. Board cards' numbers
    link to the entry.
- [x] T12 Polish pass
  - Plan: sweep every route at 1440 / 1100 / 768 / 390 in light and dark, walk the main
    screens by keyboard, clear the raw palette colours left in pages outside the queue, and
    add UI notes to the README.
  - Done. A codemod mapped 650 raw palette classes (slate / red / amber / cyan / teal / brand
    and their `dark:` slate overrides) in 21 files to the ds-\* tokens. That covers POS,
    restaurants, hospitals, mappings, users, stock, GRN entry, the error pages and others. No
    palette colour or raw hex is left in `components/` or `app/`. Sweep: 28 routes × 4 widths ×
    2 themes = 224 checks with no sideways page scroll and no page errors; spot screenshots of
    the codemodded pages look right in both themes. Keyboard: tabbing through the dashboard,
    transfers, new transfer, GRNs, items and new production, every stop shows a focus ring.
    The shell gained a "Skip to content" link (first Tab) to `#main-content`. Top bar: the
    search box gives way before the breadcrumb, and with three steps the section crumb hides
    below 2xl ("Kitchen Production › New" instead of truncated text). README has a new "UI"
    section (tokens, statuses, shared components, `?id=` panels, shortcuts, permissions, the
    width/theme check).

## Decisions

- Commit subjects read `feat(portal): <description> (T<n>)`: commitlint (config-conventional)
  rejects a subject that starts with a capital letter, so `T4 …` cannot lead.
- Only this PROGRESS.md is committed from `design-reference/`; the mockup files stay
  untracked unless asked (the GitHub repo is public).
- Record links use `?id=<uuid>` on the list page (`/inventory/transfers?id=`,
  `/inventory/grns?id=`, `/masters/items?id=`, `/kitchen/productions?id=`). T6, T9, T10 and
  T11 open that record's panel.
- Dashboard "Recent activity" is built from the latest real transfer / GRN / production
  changes rather than sample people: there is no audit-log endpoint yet (see TODO(api)).
- Dashboard "Expiring soon" reads stock balances (batch + expiry per location), which the
  backend fills from GRN batches; GrnBatch itself has no list endpoint.
- Transfers bulk bar offers Export CSV only. "Send reminder" and "Print challans" from the
  mockup have no backend (TODO(api)), so they are left out rather than shown as dead
  buttons. The same goes for "Print challan" / "Duplicate as new" on finished transfers.
- New transfer autosaves locally, not as a server draft: the API has no transfer update, so
  every server save would create another draft. "Save draft" creates exactly one draft and
  opens it in the list, where Dispatch / Cancel live.
- "GRNs to verify" means DRAFT GRNs. The API only ever moves a GRN DRAFT → POSTED_TO_STOCK
  (or CANCELLED); UNDER_VERIFICATION / ACCEPTED / PARTIALLY_ACCEPTED / REJECTED exist in the
  enum but are never set. The sidebar badge and the dashboard (T2, T5) counted
  UNDER_VERIFICATION and so always showed 0; both now count DRAFT. The dashboard's
  "partially accepted" GRN query was removed.
- Production's Chef is shown when set but not chosen on the page: picking one needs the user
  list (USER_VIEW), which kitchen roles don't have, and the old form never set it either.
- Expired batches are still allocated by FEFO, as before the redesign (the backend accepts
  them). The line now says "This batch expired on …" so it is not sent by accident.

## TODO(api)

- Audit-log list endpoint (actor, action, record, time): the dashboard's Recent activity can
  then say who did each change and link "Open audit log". Marked `TODO(api)` in
  `dashboard-overview.tsx`.
- Dashboard summary (counts + wastage per range): the dashboard makes several `limit: 1`
  count calls and reads wastage from the first 100 posted productions (`ponytail:` note).
- Transfer reminders (notify the destination about a pending acknowledgement) and challan
  printing: the mockup's bulk-bar and panel buttons for these are left out until they exist.
- Counter as a transfer destination: the backend rejects anything but a restaurant
  ("Destination must be a restaurant"), so the To side stays restaurants only.
