# AAHAR UI redesign — progress

Visual spec: `AAHAR F&B Platform – UI Concepts.pdf` (Main, Transfers, Menu, Kitchen, Acknowledge).
Stack: Next.js 15 (app router, basePath `/fandb`), React 19, Tailwind 3 (class dark mode),
TanStack Query 5, lucide-react icons, shared primitives in `frontend/apps/admin-portal/components`
(`ui.tsx`, `ui-controls.tsx`, `design-system.tsx`) and `frontend/packages/ui` (Button).

## Tasks

- [x] T0 Theme: tokens, font loading, base styles
  - Plan: self-host Plus Jakarta Sans (variable, latin + latin-ext) via `@font-face` in
    `globals.css`; add the spec tokens to Tailwind as `ds-*` colours plus radius/size tokens;
    theme-aware tokens (page, surface, borders, text) are CSS variables with dark values taken
    from the existing dark palette; retune the existing `brand-*` tokens and CSS variables to
    the nearest spec token so every current page picks the palette up; flat page background.
  - Done: `ds-*` tokens in `tailwind.config.ts`, variables in `app/globals.css`, font files in
    `app/fonts/`. Existing `brand-*` names now resolve to spec tokens; the shared Button no
    longer carries raw hex values. No raw hex left in components.
- [x] T1 Shared components (restyle the existing primitives)
  - Plan: restyle in place, keeping every prop and export, so all pages follow at once.
    `ui.tsx` (Input/Select 44px, radius 10, input-border, focus ring; Badge as token chips;
    Panel radius 16; Skeleton), `ui-controls.tsx` (Toggle in teal, Modal radius 16),
    `design-system.tsx` (AppPageHeader in the mockup's eyebrow/title/description/actions
    layout without the card box; KpiCard icon tiles on the tile tokens; ChartCard, EmptyState,
    DataTableWrapper, FormSection on tokens) and `packages/ui` Button (44px, radius 12).
  - Done: all of the above, plus the five per-module `PageHeader` copies now render the shared
    `AppPageHeader`, the shared table helpers (`organization/shared.tsx`) and every table
    header (sentence case, muted) use tokens, and 16 primary buttons lost a hard-coded teal
    override so they show the primary blue. Checked at 1440px, 390px and dark mode.
- [x] T2 App shell (restyle the existing sidebar and header)
  - Plan: in `admin-shell.tsx`, turn the existing groups into "MODULES" rows with module
    icons (active module expanded, sub-pages without icons, Dashboard as a plain link), brand
    block and client card on tokens, header with a slash breadcrumb + org name, token search,
    a location pill showing the current selection, bordered bell/theme buttons and the user
    chip; sidebar 272px, drawer below a new 900px `nav` breakpoint, content max 1360px.
  - Done as planned. The MAX logo moved from the header into the client card, which shows the
    existing location count. `cn` (tailwind-merge) now knows the custom radius/size tokens, with
    a self-check in `packages/ui/src/utils.check.ts`. Checked at 1440/1100/860/390, collapsed,
    drawer, dark mode and keyboard focus.
- [x] T3 Dashboard (restyle the existing dashboard)
  - Plan: keep every existing query and permission gate in `dashboard-overview.tsx`; greeting
    title with the user's name; Review Transfers shows the pending count it already loads; the
    three "Pending Actions" metrics become the concepts' attention cards; the six master tiles
    sit in one "Master data" card; recent transfers as a table (number, route by type, items,
    status, date) beside pending acknowledgements and recent GRNs lists. The empty placeholder
    "Food Operations Trend" chart goes, as the concepts have no such chart.
  - Done as planned; same queries, same permission gates, nothing new fetched. Loading
    skeletons and empty states kept for every list. Checked at 1440/1100/768/390 and dark.
- [x] T4 Stock transfers (restyle the existing transfers pages)
  - Plan: in `TransfersPageClient`, the existing status filter becomes `FilterTabs`; search,
    location, sort and refresh stay in the bar with source/store/kitchen/restaurant behind
    "More filters"; the table shows Transfer, Route, Items, Status, Date with a selected row;
    a right-hand details panel (stacks below 1180px) shows from/to, item lines, a timeline and
    the existing Dispatch / Accept / Partial / Reject / Cancel actions for the selected row.
  - Done as planned. Same queries and mutations; actions now show only where the status
    allows them (they used to be shown disabled on every row). `FilterTabs` added to
    `ui-controls.tsx`. Checked with Draft/Pending/Cancelled rows (test-only response copies,
    no data written), at 1440/1100/390 and dark.
- [x] T5 Menu items (restyle the existing items page)
  - Plan: in `ItemsPageClient`, the category filter becomes `FilterTabs`, search + sort +
    refresh + item count stay in the bar with status/food type/item type under "More
    filters"; the table becomes a card grid (tinted header with category pill, food-type
    marker, name, code · item type, prep/HSN, active toggle, edit/delete); the existing inline
    edit form moves into a right-hand side panel; `ItemFormFields` gets food-type radios and a
    two-column layout so it fits the panel and the create page.
  - Done as planned with the same queries and mutations. "Add item" still opens the existing
    create page. Added `FoodTypeMarker` (design-system) and an `ariaLabel` prop on `Toggle`.
    Checked at 1440 (with and without the edit panel), 390 and dark.
- [x] T6 Kitchen production (restyle the existing productions page)
  - Plan: in `KitchenProductionsPageClient`, the status filter moves to header `FilterTabs`;
    filters stay in a bar above an info strip (kitchen, production count, "not posted yet"
    alert from the drafts on the page); the table becomes a board with one column per status
    (Draft / Posted / Cancelled) and cards with number, time, items, produced/accepted,
    kitchen, chef and the existing Post / Cancel / Delete on drafts; the board scrolls
    sideways on small screens.
  - Done as planned with the same query and mutations. Checked with a test-only Draft copy
    (no data written), at 1440/390 and dark.
- [x] T7 Restaurant acknowledgement (restyle the existing acknowledge flow, mobile-first)
  - Plan: the existing partial-acknowledgement form (below the transfers table) becomes a
    full-screen sheet on phones and a right-hand drawer on desktop: back header, transfer
    summary card, a `QuantityStepper` per line for the received quantity with "matches" /
    "Short by N", the required shortfall reason when short, the existing remarks as the note,
    and a sticky footer (Cancel + Acknowledge, labelled with the number of short lines).
  - Done as planned; submission still goes through the unchanged `submitPartial` checks
    (rejected = sent − received, so "accepted + rejected = sent" always holds; the reason is
    still required). `QuantityStepper` added to `ui-controls.tsx`. Also fixed the shared
    `Modal`: a parent `space-y-*` pushed its fixed overlay down. Checked at 390/1440 and dark,
    with no acknowledgement sent.
- [x] T8 Polish pass
  - Plan: automated overflow audit of all 28 portal routes at 1440/1280/1100/768/390; keyboard
    pass with focus rings; contrast check of the token pairs; consistency sweep for headers
    that still bypass the shared one; final type-check, lint, build and raw-hex scan.
  - Done: 11 filter toolbars built from 6+ fixed-width columns overflowed their card (and
    scrolled the whole page) at 1100–1440px; they now wrap (auto-fill columns, search spans
    two). The create-GRN line row only goes multi-column from 1400px. Users / Roles now uses
    the shared header. Placeholders moved to the full muted token (≈5.9:1; the 80% shade was
    ≈3.8:1). Audit result: no page scrolls sideways at any of the five widths. Keyboard: tab
    order is logical, every control shows the 2px primary ring, Enter selects a transfer row.
    No raw hex anywhere in the redesign outside the token definitions.

## Density pass (user feedback: "way too spacious")

- Controls 44 → 40px, small buttons 36px, primary header buttons 42px (this relaxes the spec's
  44px touch-target rule, at the user's request); top bar 72 → 64px; page titles 30 → 26px;
  content padding 28/32 → 20/24px; section gaps 24 → 20px; card padding 20 → 16px; form
  grids 20 → 16px; table cells 16 → 12px (headers 10px), dates kept on one line; row toggles
  and sidebar rows slightly smaller; filter tabs 36px.
- The shared toolbar (`ToolbarGrid`) is now one wrapping row, so Kitchens and Stores carry
  Refresh in it instead of a separate row. The transfers details panel sits beside the table
  from 1320px (below it under that), so the table never scrolls inside its card.
- Checked at 1362×633 (the user's screen), 1440, 1280, 1100 and 390: no page-level sideways
  scroll, no overlapping date cells.

## Found, not fixed (outside a UI restyle)

- Fixed afterwards at the user's request: the "All items" filter on Store Stock, Restaurant
  Stock, Stock Ledgers and Kitchen Stock asked for `limit: 200` (`useItems` in
  `inventory-pages.tsx` and `kitchen-pages.tsx`), but the API caps `limit` at 100 and answered
  400, so the filter listed no items. Both now ask for 100 (predated this work, commit d80a499).
- Locally `REDIS_URL` is unset, so refresh tokens live in memory and every restart of the
  auth service signs all browser sessions out on their next renewal.

## Scope (updated by the user mid-run)

"You don't have to add anything extra, just change the existing codebase UI." So every task
restyles what already exists to the mockups' look: no new features, routes, mock data or
extra components. Mockup elements with no existing feature or data behind them are skipped
and listed under "Skipped" below instead of being mocked.

## Decisions

- Commit messages use `feat(ui): <description> (T<n>)`: the repo's commitlint
  (config-conventional) rejects the `ui` type and a subject starting with a capital letter.
- Earlier unrelated work (Preferences pop-up, session sign-out, header name) was committed
  first as its own commit so each task commit stays focused. Nothing is pushed.
- The spec palette differs slightly from the old one (#0B5CAD → #0B57A4 and so on). The spec
  tokens win; the old `brand-*` names are kept as aliases of the nearest token so no page
  breaks. Dark mode reuses the portal's existing dark palette for the theme-aware tokens.
- Builds run in a separate git worktree, because `next build` would overwrite the `.next`
  folder of the dev server that is running. On this Windows machine the build compiles,
  type-checks and generates every page, then stops at the `output: 'standalone'` copy step
  (creating symlinks needs Developer Mode). That step is environment-only; the Linux Docker
  build on AWS is unaffected. "Build passes" below means everything up to that step.
- No new component library: the mockups' Card, PageHeader, StatusChip, IconTile, StatCard and
  Toggle are the existing `Panel`, `AppPageHeader`, `Badge`/`StatusBadge`, KPI tiles and
  `Toggle` restyled. Pieces the app has no use for yet (QuantityStepper, ProgressBar,
  FoodTypeMarker, FilterTabs) are only added if a later task restyles a screen that needs them.
- Every button is at least 44px tall (spec's touch-target rule), including `size="sm"`.
- Page headers no longer draw the icon tile (the concepts show none); the `icon` prop is still
  accepted so no call site changed.

## Skipped (no existing feature or data)

- T2: the pending-count badge on Inventory and the "Ctrl K" search hint (the header search
  has no behaviour behind it yet; a hint would promise a shortcut that does not exist).
- T3: the Today / 7 days / 30 days control, "Transfers in transit", "Low-stock items",
  "Kitchen batches today", the kitchen production bar, the per-location status list and Quick
  actions (no existing dashboard feature or data behind them). The route column shows
  location types (Store → Restaurant), because a transfer does not carry the names.
- T4: Export, Period filter, Download challan, Send reminder, "In transit"/"Received"/
  "Rejected" tabs (the data has Draft, Pending acknowledgement, Acknowledged, Cancelled; tabs
  follow those), the "Delivered to restaurant" timeline step (not recorded), creator names
  (only an id is stored) and per-tab counts (only the active tab's total is known without
  extra requests). The partial-acknowledgement form is restyled in T7.
- T5: price, GST, serving unit, mapped-restaurant count and "available at" (items carry none
  of these; prices live in Item Prices and mapping in Restaurant Menus), and "Available
  today" (the toggle is the item's existing Active status, labelled as such). Import from
  Excel is not an existing feature. "Add item" keeps the existing create page instead of an
  inline create panel, so creating items behaves exactly as before.
- T6: meal-slot tabs, service time, head chef, Queued / Preparing / Ready / Dispatched
  stages, due/late chips, progress bars and per-card Start / Mark ready / Dispatch (a
  production is only Draft, Posted or Cancelled; columns and actions follow that), and "Show
  earlier batches" (the existing pagination stays).
- T7: "Extra" variance (received cannot exceed sent: rejected = sent − received must not go
  negative, so the stepper stops at the sent quantity), "Report issue" (the footer's second
  button is Cancel; full rejection stays in the details panel as Reject full), "Delivered"
  time and vehicle / sender (not recorded), units (items carry none).
- T2: the user chip keeps the role under the name (the concept shows the organisation, which
  is already in the header), so the role stays visible.
