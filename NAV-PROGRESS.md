# AAHAR navigation & routing pass — progress

Portal: `frontend/apps/admin-portal`. One task per commit.

## Tasks

- [x] N0 Route registry (`lib/navigation.ts`)
  - Plan: move `navigationGroups` (with group icons and rail labels) out of
    `admin-shell.tsx` into `lib/navigation.ts`, add the pages that are not in the sidebar
    (hospitals, roles, permissions, audit) as hidden pages, and add sub-routes (`new`,
    `[id]/edit`, `[id]/locations`, `[id]/acknowledge`) with label, parent and permission.
    Pure helpers: `getBreadcrumbTrail`, `getActiveNavHref`, `getPermittedPages`,
    `getStartPageOptions`. The shell, palette, login and preferences read from it. Risk: the
    module is imported by the login page and tests, so it must stay free of React and `@/`
    imports (icons are plain lucide components).
  - Done. 22 sidebar pages plus 4 hidden ones (Hospitals → highlights Locations; Roles and
    Permissions → Users / Roles; Audit Logs) and 16 sub-routes. `getBreadcrumbTrail` handles
    pages, `?id=` records, `[id]` sub-routes, permission-less pages (plain text) and unknown
    paths (nearest known parent; UUIDs never shown). The sidebar, its active highlight, the
    palette pages and create-command permissions, login and preferences all read the registry.
- [x] N1 Breadcrumbs component
  - Plan: `components/breadcrumbs.tsx` renders `getBreadcrumbTrail` as
    `<nav aria-label="Breadcrumb"><ol>`, with a label context (`BreadcrumbLabelsProvider` +
    `useBreadcrumbLabel(id, label)`) in the shell. Replace the shell's text crumbs and delete
    `getBreadcrumbs`, `breadcrumbLabels`, `formatBreadcrumbSegment` and `isPathActive`. Risk:
    `useSearchParams` under the layout needs a Suspense boundary.
  - Done. Group crumbs are menu buttons listing the group's permitted pages with their sidebar
    icons; the current page is marked and focused on open, arrows/Home/End move, Esc or Tab
    closes, and Esc returns focus to the button. Page crumbs are links (plain text without
    permission). The last crumb is plain text with aria-current. Record crumbs show a pulse
    placeholder until named. Labels truncate at 14rem with a title. Below 900px the trail
    collapses to one "‹ Parent" link.
- [x] N2 Dynamic labels
  - Plan: call `useBreadcrumbLabel(id, name)` right after each record loads (before any early
    return), and label a missing record "Not found" instead of leaving the placeholder.
  - Done. Transfers panel and acknowledge page (TRF number), GRN verification (GRN number),
    items panel (item name), production entry (PRD number), item price edit (item name),
    restaurant edit (restaurant name) and hospital locations (hospital name). Four-step trails
    show the group crumb as its sidebar icon (still a menu, labelled for screen readers), and
    the top-bar search now takes only leftover space (min 7rem). "Organization › Restaurants ›
    saket main restaurant › Edit" fits uncut at 1440 and 1100.
- [x] N3 URL state on list screens
  - Plan: `lib/use-url-state.ts` with `useUrlParam` / `useUrlNumberParam` (same shape as
    `useState`, with an allowed-values list), `useHrefWith` (record links that keep the
    current filters), `setUrlParams`, `useOnScopeChange` and `openRowLink`. One Suspense
    boundary in the dashboard layout. Risk: the scope-reset effects ran on load and would wipe
    restored filters, so they now fire only on a real location change.
  - Done. Transfers: `id, view, q, from, store, kitchen, to, date, sort, page`. GRNs: `id, view,
q, store, sort, page`. Items: `id, q, food, type, category, status, sort, rows, page`.
    Kitchen production: `id, view, q, kitchen, sort, page`. Every other list (store / restaurant
    / kitchen stock, stock ledgers, stores, kitchens, restaurants, hospitals and their
    locations, employees, item categories, item prices, time slots, restaurant menus, store and
    kitchen items, POS devices and machines, users): `q, page` and `status` or `view` where the
    list has one; POS also `tab`. Record numbers and item names are `<Link>`s (`prefetch={false}`,
    `scroll={false}`), a row click follows the row's link, ✕ removes `?id`, and Back closes the
    panel with the filters intact. Unknown values (`view=BOGUS`, `page=-4`) fall back to the
    default. Searches are debounced 300ms for the queries only: typing a 20-character search on
    Transfers sent 120 requests and hit the API's 429 rate limit before, 6 now.
- [x] N4 Clickable-affordance audit
  - Plan: registry helpers `recordHref` (`?id=` where the page has a detail view, else
    `?q=`), `locationHref` (store / kitchen / restaurant by code) and `notificationHref`; one
    `RecordLink` (a `<Link>`, or plain text when there is no href or the user may not open the
    page); a toast `action` link. Then sweep every table and panel, the dashboard, the bell,
    the create flows and the `router.push` buttons. Risk: links inside rows that hold typed
    quantities would throw the input away on a stray click.
  - Done. Every record number and every item / store / kitchen / restaurant name in a read-only
    table or panel links to its record; dashboard tiles and "View all" open the filtered list
    they count; notifications open their record; creates land on the new record and their toast
    carries "View …"; navigation-only buttons are links (hidden without permission); the palette
    marks the current page. Full list under "Changed files and new links".
- [x] N5 Guards
  - Plan: hide create / edit buttons the user may not open (record names already fall back to
    text through `RecordLink`); give unknown URLs a not-found state inside the shell with a
    link to the nearest known parent; grep for hardcoded `/fandb` and raw in-app `<a href>`.
    Risk: a catch-all route would swallow the 404 status and missing `/uploads` files.
  - Done. `IfCanOpen` hides New category / item / price, Add location, New store / kitchen /
    restaurant and the restaurant and item-price row Edit buttons without the sub-route's
    permission (GRN, transfer and production "New" buttons were gated in N4). The root
    not-found page now renders inside the shell: the breadcrumb shows the nearest known parent
    (`/masters/stores/abc/def` → Organization › Stores › Def), "Back to Stores" goes there,
    and the response is still a 404 (`/uploads/avatars/missing.png` too). Record pages already
    had not-found states with a way back: transfer / item panels ("… not found", Close), GRN,
    production and acknowledge ("Back to …"), item price and restaurant edit, hospital
    locations ("Back"). No `/fandb` outside `lib/base-path.ts`; the only raw anchors are hash
    links (skip link, hospital tabs); assets and the upload fetch use `withBasePath`.
- [x] N6 Tests
  - Plan: `scripts/navigation.test.mjs`, run by node's type stripping against the real
    `lib/navigation.ts` (no test framework, same as `base-path.test.mjs`), chained into the
    portal's `test` script.
  - Done. Covers every sidebar page and every sub-route (named, unnamed → placeholder,
    `?id=` vs `?q=` record links), the spec trails, `?id=` ignored on pages without a detail
    view, unknown paths (nearest parent, humanised or "Details"), trailing slashes, permission
    filtering (plain-text crumbs), no id in any crumb, the sidebar highlight, `recordHref`,
    `locationHref`, `notificationHref` and `canOpenPath`. It also walks `app/(dashboard)` and
    fails when a route on disk is missing from the registry. Checked it bites: a wrong expected
    trail and a dummy unregistered `page.tsx` both fail it.
- [x] N7 Walkthrough
  - Super Admin, 1440: all 22 sidebar pages open (200), each with its group › page trail,
    its own sidebar highlight and an h1; no page errors. Transfer TRF0001, GRN000001 and item
    rasmalai: opened from a list sorted `asc`, refreshed (same URL, same trail with the record
    name), Back returns to the list with `sort=asc` kept. Middle-click on the Transfers crumb,
    the TRF0001 number and the "coke" item name each open a new tab at their URL and leave the
    page alone. Dark mode and 390px checked on the transfer panel (links read as text, teal and
    underlined on hover / focus).
  - POS Cashier (testusertwo; no transfer, GRN or stock permissions): sidebar shows only the
    permitted groups; the dashboard shows only Restaurants and Items cards; the Restaurants
    page has no Create or Edit buttons; the breadcrumb group menu lists Restaurants and POS only;
    a transfer notification is plain text while the access one links; Transfers in a crumb is
    plain text; unknown URLs show only "Go to Dashboard" when the parent is not permitted.
  - Build (`next build` on each commit, in a scratch worktree): compiles, type-checks and
    generates 50/50 pages. It then exits 1 on this Windows machine only, copying the standalone
    output's symlinks (EPERM, no symlink privilege), the same as every build here before this
    pass; with `output: 'standalone'` off it exits 0 and `next start` serves it.
  - Found here: pages did not guard themselves by permission. A user without TRANSFER_VIEW who
    typed `/inventory/transfers` saw the list chrome with no data (the API refused) rather than
    `/forbidden`. Added after sign-off, below.
- [x] N8 Page guard (asked for after the walkthrough)
  - Plan: in the shell, once auth is ready, `canOpenPath(pathname, hasPermission)`; if false,
    show the loading shell (the page never mounts, so it fires no refused requests) and
    `router.replace('/forbidden')` (Back skips the blocked page). Unknown paths are not blocked,
    so they still reach the 404. Risk: a registry permission stricter than the API would now
    lock out someone who uses that page today, so every registry code was checked first.
  - Checked: all 39 registry codes are seeded (`prisma/seed.ts`); every page's permissions
    equal its list endpoint's (`@Permissions` on `@Get()`), and every create / edit sub-route's
    equal its `@Post()` / `@Put(':id')`. One mismatch, fixed: the acknowledge page reads the
    transfer through `GET /transfers/:id` (TRANSFER_VIEW or KITCHEN_TRANSFER_VIEW) but the
    registry asked for TRANSFER_VIEW only, which would have newly blocked kitchen-transfer
    viewers; it now takes either (test added).
  - Done. Super Admin: 34 URLs (every page, hidden page, create page, acknowledge, a record,
    a 404) open, none forbidden. POS Cashier: Dashboard, Restaurants, Items and Restaurant
    Stock open; Transfers (with and without `?id=`), New transfer, Acknowledge, GRNs, New
    restaurant, Users and Roles go to `/forbidden` without firing their own requests; an
    unknown URL is still a 404; Back from `/forbidden` returns to the page before. Not run: a
    full `next build` (shell and registry only; typecheck, lint and tests are clean).
  - Unrelated, seen while checking: the top-bar location picker requests `/hospitals` on every
    page, which a user without HOSPITAL_VIEW gets a 403 for. It was like this before; left as is.

## Decisions

- Commit subjects read `feat(portal): <description> (N<n>)`: commitlint rejects a subject that
  starts with a capital, so `N1 …` cannot lead (same as the UI v2 pass).
- `/masters/hospitals` renders the same screen as the sidebar's Locations, so it is a hidden
  page labelled "Hospitals" that highlights Locations; the spec's hospital trail
  (Organization › Hospitals › Max Healthcare › Locations) comes from it.
- Lists without a detail view (hospitals, restaurants, item prices) address a record by name:
  its crumb links to the list searched for it (`?q=`). Lists with a panel use `?id=`.
- Roles, Permissions and Audit Logs (placeholder pages) sit in Access as hidden pages behind
  ROLE_VIEW, PERMISSION_VIEW and AUDIT_LOG_VIEW.

- List filters use the History API (`history.replaceState`, which Next 15 keeps in sync with
  `useSearchParams`) rather than `router.replace`: the same URL and no reload or scroll jump,
  but no server round-trip for every keystroke. Opening a record is a `<Link>` push, so Back
  works; closing replaces, leaving one "dead" back step rather than reopening.
- The page-level Location filter (shown only on All locations) stays local; the top-bar
  location is the source of truth and already persists. Dialog searches (location picker)
  stay local too.
- Stores, kitchens and restaurants have no detail view, so their links open the list searched
  by code (`/masters/stores?q=STR0001`): every hospital has a "Main Store", so a name search
  would match several rows. Codes come with every payload; the name is the fallback.
- Rows that hold typed input (GRN verification while DRAFT, acknowledge lines, production
  entry, new transfer / GRN forms) keep item names as plain text: following a link there would
  discard the quantities. The same names link once the record is read-only.
- After a create, records with a detail view open it (transfer, GRN, production, item); the
  rest open their list searched for the new record's code or name. A GRN creator without
  GRN_VIEW stays on the create page with the result panel, as before.
- `components/organization/locations-pages.tsx` and `counters-pages.tsx` are not imported by
  any route (the routes redirect); they are left untouched.
- Unknown URLs use the root `app/not-found.tsx` wrapped in the shell, not a catch-all route.
  A `[...missing]` page calling `notFound()` rendered the same UI but answered 200 (dev and
  production builds alike, since the shell streams first), and also turned missing `/uploads`
  files into 200 HTML.
- Create / edit buttons are hidden, not shown as text, when the user may not open them; a
  disabled-looking label would read like a broken button.

## Changed files and new links

### N4

Shared: `lib/navigation.ts` (`recordHref`, `locationHref`, `notificationHref`),
`components/record-link.tsx` (new), `components/inventory/use-locations.ts`
(`useLocationHrefs`), `components/toast-provider.tsx` (`action` link; such toasts stay 8s).

| File                                                             | Element                                                      | Links to                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `organization/dashboard-overview.tsx`                            | "Review pending", Pending acknowledgements tile              | `/inventory/transfers?view=PENDING_ACKNOWLEDGEMENT`                                    |
|                                                                  | Transfers today / 7 / 30 days tile                           | `/inventory/transfers?date=today\|7d\|30d`                                             |
|                                                                  | GRNs to verify tile                                          | `/inventory/grns?view=DRAFT`                                                           |
|                                                                  | Production posted tile                                       | `/kitchen/productions?view=POSTED`                                                     |
|                                                                  | Task reference (TRF / GRN / PRD)                             | the record (`?id=`)                                                                    |
|                                                                  | Task "View all"                                              | the same filtered view as its tile                                                     |
|                                                                  | Recent activity reference                                    | the record (`?id=`)                                                                    |
|                                                                  | Expiring item name                                           | `/masters/items?id=`                                                                   |
|                                                                  | "Open store stock"                                           | `/inventory/store-stock?view=NEAR_EXPIRY`                                              |
| `notification-bell.tsx`                                          | Notification row                                             | its record (`link?id=entityId`); off-site links dropped; plain text without permission |
| `inventory/inventory-pages.tsx`                                  | GRN list: store name                                         | store (`?q=code`)                                                                      |
|                                                                  | GRN view: line item (read-only GRNs), receipt store          | item, store                                                                            |
|                                                                  | GRN list "New GRN", create "Back to GRNs" / "Close"          | were `router.push` buttons, now links                                                  |
|                                                                  | GRN create                                                   | lands on `/inventory/grns?id=`; toast "View GRN…"                                      |
|                                                                  | Store stock: store, item                                     | store, item                                                                            |
|                                                                  | Transfers list: From / To names                              | store or kitchen, restaurant                                                           |
|                                                                  | Transfer panel: From / To, line items                        | store or kitchen, restaurant, item                                                     |
|                                                                  | Transfers "New transfer"                                     | was a `router.push` button, now a link                                                 |
|                                                                  | New transfer save / submit, acknowledge                      | toast "View TRF…" (both already landed on the record)                                  |
|                                                                  | Acknowledge strip: From / To                                 | store or kitchen, restaurant                                                           |
|                                                                  | Restaurant stock, stock ledgers: location, item              | location, item                                                                         |
| `kitchen/kitchen-pages.tsx`                                      | Production card: first item, kitchen                         | item, kitchen                                                                          |
|                                                                  | "New production"                                             | was a `router.push` button, now a link                                                 |
|                                                                  | Production save                                              | toast "View PRD…" (already landed on the record)                                       |
|                                                                  | Kitchen stock: location, item                                | kitchen, item                                                                          |
| `master-data/master-data-pages.tsx`                              | Items panel Mapping tab: store / kitchen / restaurant        | the location                                                                           |
|                                                                  | Item prices list: restaurant, item                           | restaurant, item                                                                       |
|                                                                  | Category, item, item price (create and edit), employee saves | land on the new record; toast "View …"                                                 |
| `mapping-foundation/mapping-foundation-pages.tsx`                | Store items, kitchen items, restaurant menus: location, item | the location, item                                                                     |
| `organization/{hospitals,stores,kitchens,restaurants}-pages.tsx` | Create (and restaurant edit)                                 | land on the list searched by code; toast "View …"                                      |
| `command-palette.tsx`                                            | Go-to rows                                                   | the current page reads "… · Current page"                                              |

### N5

| File                                                  | Element                                                | Change                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `components/record-link.tsx`                          | `IfCanOpen`                                            | new: renders its button only when the user may open the href                              |
| `master-data/master-data-pages.tsx`                   | New category, New item, New price, item-price row Edit | hidden without ITEM_CATEGORY_CREATE / ITEM_CREATE / ITEM_PRICE_CREATE / ITEM_PRICE_UPDATE |
| `organization/hospitals-pages.tsx`                    | Add Location                                           | hidden without HOSPITAL_CREATE                                                            |
| `organization/stores-pages.tsx`, `kitchens-pages.tsx` | Create                                                 | hidden without STORE_CREATE / KITCHEN_CREATE                                              |
| `organization/restaurants-pages.tsx`                  | Create, row Edit                                       | hidden without RESTAURANT_CREATE / RESTAURANT_UPDATE                                      |
| `app/not-found.tsx`                                   | Unknown URL page                                       | inside the shell; "Back to" the nearest parent and "Go to Dashboard"; still 404           |
