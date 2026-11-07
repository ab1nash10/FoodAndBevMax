# UI design log

Running log for the `/loop` UI refinement pass. Read this before every iteration; never redo or undo
logged work. Newest iteration at the bottom.

## Stack

- `frontend/apps/admin-portal`: Next.js 16 (App Router, Turbopack dev), React 19, Tailwind CSS 4,
  TanStack Query, lucide-react icons. Shared `@aahar/ui` (`cn`), `@aahar/api-client`.
- Served under `/fandb/` (dev: `http://localhost:3000/fandb/`, run by the user, never a second stack).
- Checks: `eslint`, `tsc --noEmit`, `vitest run lib components`, Playwright `pnpm test:ui` (needs
  `E2E_MOBILE` + dev OTP; covers POS, dialogs, record panels, not the kiosk).

## Design tokens (already defined, reuse, add none ad hoc)

`app/globals.css` `@theme`, light + dark via CSS variables (`.dark` class):

- Colour: `ds-page`, `ds-surface`, `ds-text` / `-2` / `-3`, `ds-muted`, `ds-divider`, `ds-border`,
  `ds-primary` (#0b57a4) / `-hover` / `-soft` / `-border`, `ds-link`, `ds-ring`, `ds-teal*`,
  `ds-status-{pending,info,ok,bad,neutral}-{bg,fg}`, `ds-food-{veg,non-veg,egg}`, `ds-stage-*`,
  tile pastels `.tile-{blue,violet,green,amber,rose}`.
- Radius: `card` 20px, `control` 11px, `control-lg` 12px, `tile` 14px. Shadows: `card`, `card-hover`.
- Type: Geist (sans) + Geist Mono (codes, prices); weights tuned one notch lighter (550/600/650/700);
  Tailwind 3 fixed line heights. Spacing: Tailwind scale + `control` 40px, `cta` 42px, `rail`,
  `sidebar`. Breakpoints: sm 640, md 768, nav 900, lg 1024, xl 1280, 2xl 1536.
- Brand: blue + white (decided 2026-10-21). The loop brief asks for a warm appetising accent; that is
  a brand decision for the user, so colours are not changed by this loop.

## Backlog mapped to this app

| # | Brief screen | Here | Status |
| --- | --- | --- | --- |
| 1 | Home / menu | Kiosk menu `components/kiosk/kiosk-menu.tsx` | Phone/tablet layout fixed (iteration 1); no search/filters: a touch kiosk menu, needs a product call |
| 2 | Product detail | None: the kiosk adds straight from the tile; items have no description, sizes or add-ons in the data | Needs data + product decision, not UI |
| 3 | Cart | Kiosk review `components/kiosk/kiosk-review.tsx` | Fixed (iteration 3); no coupon field in the data |
| 4 | Checkout | Same review screen (pay at counter, no delivery/address) | With #3 |
| 5 | Order tracking | Kiosk done screen + TV board `components/order-board` | Done: done screen fixed (it. 4), board checked, no change needed (it. 5) |
| 6 | Admin dashboard | `components/dashboard`, POS, masters | Owned by session aahar-20; skip unless asked |

### Open issues

- ~~**High**: Kiosk welcome "Tap to order" pill~~ fixed in iteration 2.
- ~~**High**: Kiosk review screen at 320/360px~~ fixed in iteration 3. Keep its totals box order
  as it is (Items at menu prices, Staff discount, Taxes only when GST is added on top, To pay at
  the counter): it matches the counter bill (aahar-20).
- **Done (iteration 6)**: ~~Medium~~: Kiosk uses raw hex (`#2563eb`, `#4f46e5`, `#7c3aed` gradients, ring, Add button)
  instead of `ds-primary` tokens.
- ~~**Medium**: Kiosk done screen at 320px~~ fixed in iteration 4.
- **Decision**: item photos. Tiles show a letter avatar; the menu API has no image field.

### Coordination (other sessions, 2026-10-24)

Order board (`components/order-board`, aahar-20's, cleared for this loop 2026-10-24): it draws on a
fixed 1920×1080 canvas that `BoardCanvas` scales and letterboxes to any TV, so its px sizes are
deliberate. No fluid sizing or breakpoints; check at 1920×1080 plus a 4:3 and an ultrawide viewport
for letterboxing, not reflow. Keep `suppressHydrationWarning` on the clock/date in
`board-header.tsx` and `cursor-none`; keep `board.module.css` animations transform/opacity only
and off under prefers-reduced-motion; `READY_SLOTS = 8` (4×2) in `lib/order-board/rules.ts` is
pinned by `rules.test.ts`. Demo feed: `/fandb/board/<any-uuid>?demo=1`.

aahar-20 owns the kiosk feature (keep `lib/kiosk.ts` cart maths, `menu.canPay` gating, idle reset,
safe centring) plus design-system.tsx, dashboard, GRN/transfer screens, command palette. aahar-dc:
Reports, `lib/navigation.ts`. aahar-d7: performance (use-locations, sidebar, bell, query-keys).

## Iterations

### 1 · 2026-10-24 · Kiosk menu breaks below 1024px

- **Why**: measured at 320/360px: every tile's Add button and stepper spilled out of the tile and off
  screen; chips stacked vertically over half the screen; the restaurant name truncated to one
  letter; "Review order" overflowed the bar. At 768px the stepper was clipped; at 1280px it was 3px
  short and silently squeezed.
- **Changed** (classes only, no logic, API or routing):
  - Grid: `repeat(auto-fill, minmax(min(100%,16rem),1fr))` below xl (1 column on phones, 2 on a
    portrait tablet, 3 at 1024px), still 4 at xl.
  - Tile footer and order bar `flex-wrap`: controls drop to their own row instead of clipping;
    "Review order" goes full width on phones (`max-sm:w-full`, 20px text, 24px padding).
  - Category chips: one sideways-scrolling row on phones (`overflow-x-auto`, no scrollbar,
    `shrink-0` chips), wrapping from sm.
  - Header: gap 12px on phones, title `clamp(22px,5vw,36px)` and up to 2 lines; Start over is
    icon-only below sm (label kept as `sr-only`, so the accessible name stays).
  - Stepper gap 12px → 8px so a 3-digit price sits beside it in a 4-column tile (56px targets kept).
- **Files**: `components/kiosk/kiosk-menu.tsx`, `components/kiosk/kiosk-parts.tsx`.
- **Verified**: Playwright script against the running dev portal with the menu API mocked (12
  items, long names, ₹1,250.5 price), 3 items in the cart: no element outside the viewport or
  clipped by its tile, no tap target under 44px, at 320/360/768/1280. Screenshots checked by eye.
  eslint clean, prettier applied, no type errors in kiosk files. Not verified: the real kiosk with
  live data; dark theme (the kiosk forces light).
- **Pre-existing failures, not from this change**: `tsc` errors in `components/reports/*` and
  `lib/report-excel.ts` (Reports in progress, aahar-dc); `lib/query-keys.test.ts` "every prefix
  stays as it is" (query-keys in progress).

### 2 · 2026-10-24 · Kiosk welcome screen on phones

- **Why**: at 320/360px the "Tap to order" pill (`h-[96px] px-16 text-[34px]`) wrapped its label
  onto two lines and squashed the hand icon; the three step cards squeezed their number badges and
  icons into centred three-line text; the screen ran a third past the fold.
- **Changed** (`Welcome` in `components/kiosk/kiosk.tsx`, classes only):
  - Padding 24px on phones, 40px from sm.
  - Steps: a full-width stacked list on phones, left-aligned 18px text, number badges `shrink-0`,
    the decorative step icon hidden below sm (the number leads); the row of pills from sm as before.
  - Pill: `h-[clamp(72px,12.5vw,96px)]`, `px-[clamp(28px,8vw,64px)]`,
    `text-[clamp(24px,5vw,34px)]`, `whitespace-nowrap`, icon `shrink-0`. Same size as before at
    768px and up. Also `shrink-0`: in the scrolling flex column a one-line pill otherwise shrinks
    to its text height (caught at 36px in the first attempt).
- **Files**: `components/kiosk/kiosk.tsx`.
- **Verified**: Playwright against the dev portal, menu mocked: no element inside the welcome
  button outside the viewport at 320/360/768/1280; pill 72px tall at 320/360; screenshots at 320
  and 1280 by eye (1280 unchanged). eslint and prettier clean; no type errors in kiosk files. The
  screen still scrolls a little at 320×800 (903px of content); it is safe-centred and the whole
  screen is the tap target, so left as is.

### 3 · 2026-10-24 · Kiosk review screen and staff keypad on phones

- **Why**: at 360px each order line squeezed the item name to nothing and the stepper overlapped
  the "each" price; at 320px line totals ran off screen (fixed `w-[110px]` column). The staff
  discount dialog did not scroll: "Apply discount" was below the screen at 320×800 and 360×800,
  and at 360×640 the bottom keypad row too, so staff on a phone-sized screen could not apply it.
- **Changed** (`components/kiosk/kiosk-review.tsx`, classes only; totals box untouched):
  - Order line: `flex-wrap`, name block `flex-1 basis-48`, total `ml-auto` with the 110px column
    from sm only, padding 20px on phones. Phones: name and unit price on row 1, − n + and line
    total on row 2. One row from 768px as before.
  - Staff dialog overlay: flex column, `justify-center-safe`, `overflow-y-auto`,
    `overscroll-contain`, padding 16px on phones; card `shrink-0`, padding 20px on phones.
  - Keypad keys `h-[clamp(56px,9dvh,72px)]`: 72px on a tall screen, never below 56px.
- **Files**: `components/kiosk/kiosk-review.tsx`.
- **Verified**: Playwright against the dev portal, menu and staff lookup mocked, three lines incl.
  a long name and ₹1,250.5 × 2, at 320×800, 360×640, 360×800, 768×1024, 1280×800: nothing off
  screen or clipped, no tap target under 44px, every item name ≥80px wide and clear of the
  stepper, "Apply discount" reachable by scrolling the dialog. Screenshots at 360 and 1280 by eye.
  eslint, prettier, no kiosk type errors, `lib/kiosk` tests 3/3. Not verified: on-device scrolling
  of the dialog on a real touch kiosk.

### 4 · 2026-10-24 · Kiosk "order placed" screen

- **Why**: the receipt lines truncated item names on phones ("1 × Paneer Butter Mas…"), the one
  place a guest checks what they ordered. The screen is a scrolling flex column, so whenever its
  content was taller than the screen it squashed its children instead: the round tick badge went
  flat and at 1280×800 (a common landscape kiosk) the Done button shrank below 44px.
- **Changed** (`Done` in `components/kiosk/kiosk.tsx`, classes only):
  - Column `*:shrink-0`; padding 24px on phones; gaps `clamp(16px,3vh,32px)`.
  - Order number `clamp(96px,min(22vw,20vh),240px)`: sized by height too, so the whole screen
    including Done fits at 1920×1080, 1280×800, 1024×768 and 768×1024 (216/160/154/169px).
  - Receipt lines wrap (`min-w-0`) instead of truncating; prices `shrink-0`. Card padding 20px on
    phones.
- **Files**: `components/kiosk/kiosk.tsx`.
- **Verified**: Playwright against the dev portal, menu and order POST mocked, three lines incl.
  a long name: at 320×640, 360×800, 768×1024, 1280×800 nothing off screen, no text overflowing,
  no truncated line, no tap target under 44px, tick badge round; Done on screen at the four kiosk
  sizes above (on phones it scrolls, and the screen resets itself after 30s). Screenshots at
  1280×800 by eye. eslint, prettier, no kiosk type errors.
- **Pattern to remember**: a `flex-col overflow-y-auto` screen shrinks fixed-height children
  (badges, buttons) before it scrolls; give them `shrink-0`. Overflow checks alone miss it, so
  also check sizes or look at the screenshot.

### 5 · 2026-10-24 · TV order board: checked, no change

- **Checked**: `/fandb/board/<uuid>?demo=1` at 1920×1080, 1440×1080 (4:3), 2560×1080 (ultrawide),
  1280×720 and 1024×768, after 6s of the demo feed. The 1920×1080 canvas sits fully on screen
  and centred at every size, letterboxed as designed (bars top/bottom at 4:3, sides on
  ultrawide); no element is cut off by the canvas (the only flags were `sr-only` labels, which
  are clipped on purpose). Long text is already handled: "+N more" past the ready/preparing
  slots, truncated names and counters, the now-ready line clamped to 2 lines. Secondary text
  contrast on the light page: `ds-text-3` 6.88:1, ready green 6.12:1, "collect soon" amber
  6.67:1.
- **Changed**: nothing, per the board's fixed-canvas design (see Coordination).
- **Not verified**: a real TV, real feed, dark board theme.

## Status after iteration 5: stopped for decisions

Every open item left needs a decision from the user:

1. **Brand colour**: the brief's warm accent vs the 2026-10-21 blue + white; and whether the
   kiosk's bright blue→indigo→violet gradients (raw hex) move to `ds-primary` (#0b57a4, darker,
   flat) or get their own tokens. Blocks the medium "kiosk raw hex" item.
2. **Food photos**: no image field on menu items; tiles show a letter avatar.
3. **Screens the data does not support**: product detail (sizes, add-ons, description), coupon,
   delivery/address checkout, menu search/filters. Product decisions first.
4. **Admin dashboard** (#6) is aahar-20's; not touched unless the user says so.

### 6 · 2026-10-24 · Kiosk colours onto the brand tokens

- **Decision** (user: "go ahead with your suggestion"): keep the 2026-10-21 blue + white brand,
  no warm accent; kiosk blues come from existing tokens, no new colours. Photos, unsupported
  screens and the dashboard stay as in the status above.
- **Changed**:
  - `app/globals.css`: `--ds-primary-gradient` (+ `-hover`), the logo-blue gradient, moved from
    `.dark` to `:root` so light screens can use it. Same value; dark mode unchanged.
  - `kiosk-parts.tsx`: `primaryButton` blue→indigo gradient → `bg-(image:--ds-primary-gradient)`,
    shadow tinted with `ds-primary`.
  - `kiosk-menu.tsx`: selected ring, Add button, bag icon → `ds-primary`.
  - `kiosk.tsx`: welcome headline (was blue→indigo→violet) and order number → the same gradient.
- **Contrast**: white on the gradient's light end rgb(36 119 207) 4.55:1; gradient text on
  `ds-page` ≥4.3:1 at 48px+ bold (large text, needs 3:1).
- **Verified**: computed styles in Chrome (Playwright, kiosk API mocked) show the gradient on the
  headline, pills and order number and `rgb(11 87 164)` on Add and the bag icon; welcome, menu,
  review and done screenshots at 1280×800 by eye. Layout check: 768/1280 OK; at 360 only the
  category row reports chips past the edge, which is the intended sideways-scroll row. No raw hex
  left in `components/kiosk`. eslint, prettier, tsc (0 errors) pass.
- **Left as is**: the kiosk backdrop's soft colour pools (inline rgb) match the order board's
  backdrop in `globals.css`; decorative, shared with the board.
- **Not verified**: a real kiosk screen; the portal's dark theme by eye (token value unchanged).

## Status after iteration 6: stopped for decisions

Brand colour settled (blue + white, tokens). Still open, all need the user: food photos (no image
field), product detail / coupon / delivery checkout / menu search (no data), admin dashboard
(aahar-20's).

---

# Phase 2 · Full redesign of every module (2026-10-24)

User: "proper enhancement and redesign… every module… kiosk, open board and every other module
without fail". Picked: **blue + white, bolder** (Riotters look kept, more visible), **shared look
first, then every module**, aahar-d2 **takes over** other sessions' UI files (they acked, all idle).

## Keep-list from the other sessions (all uncommitted on dev-v1-new: build on disk, never revert)

- **aahar-dc (Reports)**: reports-page.tsx, reports/page.tsx, lib/report-excel.ts (untouched),
  nav Reports entry. Keep `useUrlParam('report')`, reportsApi calls + query keys, PREVIEW_ROWS,
  ReportTable group header row (column.group colSpan), `downloadReportExcel(result)`.
- **aahar-d7/82 (perf)**: sidebar-content `useNavCounts` = ONE query
  `queryKeys.dashboardNavCounts('all', scope)`; notifications-bell reads it via
  `useCached`/`useCachedState` + `notifyManager.batchCalls`, no own fetch; use-locations one
  `locationNames` query; counters-tab invalidates `locationNames()`; login-form uses a local
  validator, **no zod** on the sign-in page.
- **aahar-20**:
  - design-system: StatStrip = slim filter pills (active `ring-2 ring-ds-link`); RowOpen
    `nextStep`, always visible; QuickTile `count`/`countLabel`, "✓ All done" at 0.
  - dashboard: kpi-card `empty` prop (words, no delta/sparkline); `tileCounts` from useNavCounts.
  - board-header: `suppressHydrationWarning` on clock/date.
  - kiosk: cart maths, canPay, idle reset, safe centring, totals order, "watch the board for
    <number>" wording.
  - POS billing: till guard (TillSetup), "Waiting to pay" kiosk list, kiosk order no. + Load
    form/chip, "Change till" (POS_DEVICE_UPDATE), aahar-dc's shift gate. shared.tsx: usePosCounter
    `?host=` logic + localStorage `aahar.pos.host`, printBill "Watch the board for" block.
    till-setup.tsx new.
  - restaurant-orders-page: "Open kiosk" + copy-kiosk-link.
  - login: Email OTP / Mobile OTP tabs, no password UI.
  - Labels: "Added to stock", "Deliveries (GRN)" (asserted by scripts/navigation.test.mjs),
    "Receive a delivery", "Item Locations".
  - transfers-page: Acknowledge link in last column. command-palette: KP results.
  - e2e/pos.spec.ts relies on the till host in localStorage + "Open shift"; update the spec if renamed.
- **User rules**: Riotters look, light sidebar (Linear/Vercel rejected); hero on Dashboard only;
  no "+ New" in nav; nothing off-screen; never delay content; no `<ViewTransition>`; no new load
  requests; transitions ≤150 ms; measure on a prod build; `pnpm test:ui` on every module (warn
  peers first, E2E_MOBILE=9999999991); show a one-screen sample before restyling everything.

## Phase 2 iterations (2026-10-24, aahar-d2)

### 7 · Shared look v3 ("bolder"), reaches every module
- `globals.css`: radius card 24 / control 14 / tile 18; Geist weights back to Tailwind's (600/700/
  800/900); controls 44px; page `241 245 251`; card shadow with a soft blue lift; `.bg-ds-primary`
  carries the logo-blue gradient in BOTH themes (was dark only); `--ds-primary-gradient` in
  `:root`; new `.shell-wash` (static blue wash at the top of every page).
- `packages/ui/src/button.tsx` (rebuilt `dist`): default/icon h-11, primary with blue glow,
  outline hovers blue. `ui.tsx` Input/Select: shadow, blue hover, ring-4 focus; labels darker.
- Shell: active module = solid blue pill; module pages = pill tabs; header translucent over the wash.
- `AppPageHeader`: new `PageIcon` (components/page-icon.tsx) draws the page's own nav icon in a
  solid blue tile; title 34px bold; count chip solid blue. Table header band blue-tinted.
### 8 · Sign in: one brand-blue canvas, white card floating, rings with food icons around the card (lg+).
### 9 · Kiosk redesign
- Shared `components/food-art.tsx` (`FoodArt`, `foodIcon`, `toneOf`): pastel tile + food icon
  guessed from the name (ponytail: replace with item photos when items carry one).
- Welcome: split layout with a 2×2 collage of today's dishes (lg+). Menu: category rail with food
  icons (lg+), picture cards (art on top, count badge, big Add), "Veg only" filter (client-side,
  shown only when the menu has both), order panel beside the menu (xl+). Review: two columns
  (lg+), Place order under the bill. Done: ticket (number on blue, tear line, pay + lines).
  Kept: cart maths, canPay, idle reset, safe centring, totals order, "watch the board" wording.
### 10 · TV order board (fixed canvas kept): solid green "Ready to collect" and blue "Preparing"
  pills with white count badges; Now-ready card solid green with a huge white number; ready tiles
  green-tinted (amber when "Collect soon"); badges `bg-white/95` so dark theme keeps them white.
### 11 · Dashboard: brand-blue hero (white text, white "Review pending"), KPI cards with 44px icon
  chips and 36px bold values. POS billing: item tiles get a food-art band.
### Verified (phase 2)
- Sweep of all 46 routes at 1440 + 390: no horizontal scroll anywhere; screenshots by eye.
- Kiosk audit at 1920×1080, 1080×1920, 1366×768, 390×844: nothing off screen, no tap target <44px.
- Board light + dark at 1920×1080 (demo feed). Login at 1440, 1366, 390.
- `next build` passes; `npm test` (69 vitest + 3 script tests) passes; tsc 0 errors; eslint and
  prettier clean on changed files; `pnpm test:ui` 3/3 passed.
- Speed (prod build on :3200, CORS answered in the test browser): repeat module switch 50–84 ms
  (baseline 49–80), first visit 56–201 ms (baseline 90–483).
- Not verified: real kiosk/TV hardware, live kiosk data (mocked), every dialog/detail panel by
  eye (covered only where test:ui opens them), dark theme on every portal page.
- Keep (aahar-20 fix, 2026-10-24): kiosk Welcome wrapper uses `items-center-safe` (row flex);
  plain `items-center` clipped the logo on a 1366×623 window with no way to scroll up to it.

## 2026-10-24: Notifications module removed (user request)

- Deleted `components/notifications/` (bell, `notification-groups.ts` and its test) and the
  bell from the top bar in `admin-shell.tsx`. The backend table was already dropped
  (migration `20261013130000_drop_notifications`), so the dead `/notifications` routes went
  too: `backend/all-services.mjs`, `infra/k8s/40-ingress.yaml`, `infra/helm/fandb/values.yaml`.
- The perf keep-list note above about notifications-bell reading the nav counts no longer
  applies; `useNavCounts` (one query) is unchanged. Pending work still shows on the nav badges
  and the Dashboard work queue.
- Verified: tsc 0 errors, eslint clean, `npm test` 65 vitest + 3 script tests pass, Helm chart
  renders for `dev` with no notifications path. Not checked in a browser: the dev stack was down.

## 2026-10-24: POS bill panel ("very vague" per user)

- Cause: on a laptop-height screen (1366×700) the pinned foot (payment + totals + buttons) took
  ~70% of the bill panel, so the items were hidden even with one on the bill; seven optional
  fields and a per-line note box filled the rest.
- `billing-page.tsx`: header with a blue receipt chip and an item-count pill; empty state with
  icon and "No items yet"; quantity stepper as a pill with a solid blue +; kitchen note behind
  "+ Add note" (a line with a note keeps its box; resets when the bill empties so it never takes
  focus from search); Instructions, mobile, Employee ID and Complimentary folded into a
  "Customer, staff & notes" `<details>` whose closed row lists what's filled, and which opens
  itself when Complete order finds a problem; the totals breakdown moved under the items (the
  Complete button keeps the grand total pinned); payment mode is a segmented control with a
  solid blue selection; "Collect via" chips get a check on the chosen one.
- `shared.tsx` BillTotals: Grand total bold, amount text-xl (also in the bill side panel).
- No logic, API or validation change. Verified: tsc, eslint, prettier, `npm test`; screenshots at
  1366×700, 1440×900, 390×844 empty / items / extras open, no horizontal scroll.
