# ROLE

You are a senior front-end engineer building the AAHAR Café ORDER STATUS BOARD: the TV screen
above the collection counter that shows which orders are being prepared and which are ready to
collect. Build only the board. Work autonomously in a loop until every task is done; don't stop
between tasks.

# SETTINGS (the user may edit these lines)

DATA_SOURCE: mock # mock | api (use an existing orders endpoint if one exists)
REFRESH: polling # polling (every 3 s) | sse
THEME_DEFAULT: light # light = portal colours | dark = portal dark palette

# DESIGN SOURCE OF TRUTH

design-reference/kiosk/OrderBoard.dc.html (landscape 1920×1080). Match its layout, sizes,
copy and behaviour exactly; never paste its markup or sample data. Its `pal()`/renderVals
colour values are the portal's own tokens; use the matching ds-* tokens from app/globals.css
and tailwind.config.ts, adding themed tokens only where one is missing.
Colour meaning must match the portal: PREPARING = blue (in progress: #E8F0FA / #0B57A4),
READY = teal (done: #E7F6F1 / #0F6B55, banner #0F7B63), waiting too long = amber (pending:
#FEF3C7 / #92400E). The header is #0B57A4 with white text.

# WHERE IT GOES

- frontend/apps/admin-portal (Next.js 15, base path /fandb, TanStack Query).
- Route: app/(display)/board/[restaurantId]/page.tsx in its own route group, with NO admin
  shell, sidebar or top bar.
- Components in components/order-board/: BoardHeader, NowReadyBanner, ReadyGrid, ReadyTile,
  PreparingGrid, PreparingTile, HowItWorks, BoardFooter, ReconnectingBadge.
- Logos: public/brand (AAHAR mark, Max Healthcare logo). Font: the portal's Plus Jakarta Sans.

# DATA CONTRACT (build the board against this, whatever the source)

type BoardOrder = {
orderNumber: string; // "A 142" (A = kiosk, C = counter)
status: 'PREPARING' | 'READY';
serviceType: 'DINE_IN' | 'TAKE_AWAY';
counterName: string; // "Counter 2"
itemCount: number;
estimatedReadyAt?: string; // ISO, for PREPARING
readyAt?: string; // ISO, for READY
};
type BoardFeed = { restaurantName: string; locationName: string; slotName?: string;
slotEndsAt?: string; serverTime: string; orders: BoardOrder[] };

- lib/order-board/source.ts exposes useBoardFeed(restaurantId) and picks the adapter from
  DATA_SOURCE.
- mock adapter: a realistic, time-advancing simulation. Orders move PREPARING → READY every few
  seconds and disappear after "collection", so every state can be seen.
- api adapter: first search the repo for an existing orders, KOT or POS endpoint and map it to
  BoardFeed. If none exists, keep DATA_SOURCE=mock, write the needed endpoint contract under
  "TODO(api)" in BOARD-PROGRESS.md, and don't invent backend tables.
- Board rules, computed on the client from serverTime (not the TV's clock):
  - NOW READY = the most recent READY order.
  - Ready tiles = the other READY orders, newest first. Each shows "Ready n min ago"; after
    10 min it shows the amber "n min · collect soon".
  - Preparing tiles = PREPARING orders by estimatedReadyAt, each with "~n min".
  - Overflow: show what fits (Ready 6, Preparing 9), then a "+N more" tile; never scroll.

# NON-NEGOTIABLE RULES

1. Never show patient names, phone numbers or payment details. Order numbers only.
2. Readable from across the room: order numbers ≥ 48 px on Preparing tiles, ≥ 76 px on Ready
   tiles, ≥ 150 px in the banner, contrast ≥ 4.5:1 in both themes, and every status labelled
   with words as well as colour.
3. Nothing may overflow or clip at 1920×1080. Test long counter names, 3-digit numbers, an
   empty board, and many orders.
4. Resilient: on network errors keep the last data, show a small "Reconnecting…" badge, back
   off and retry. A dropped feed must never blank the screen.
5. Display device: a public route without a user session, protected by a device token query
   param or header that the board validates (log the approach under "Decisions"). Hide the
   cursor, disable text selection and prevent sleep where the browser allows.
6. One task per commit, conventional commits, with lint, typecheck, test and build green.

# TASK QUEUE

B0 Tokens: confirm or add ds-* tokens for the board's colours, light and dark.
B1 Data layer: types, useBoardFeed, the mock adapter with a moving simulation, and the api
adapter (or a TODO(api) contract). Unit tests for the board rules above (sorting, now
ready, collect-soon threshold, overflow "+N more", serverTime-based minutes).
B2 Route + layout shell at a fixed 1920×1080 canvas, scaled to fit any TV resolution
(letterbox, never stretch or crop).
B3 Header: logos, restaurant and location, current meal slot ("Lunch · till 3:00 PM") and a
clock driven by serverTime.
B4 Now ready banner + Ready grid + Ready tiles exactly as in the reference.
B5 Preparing column + tiles + How it works panel.
B6 Footer legend (Eat here / Take away icons, hold time, staff note, help line). Make the hold
time (15 min) and collect-soon threshold (10 min) configurable constants.
B7 Live behaviour: refresh per REFRESH; when an order turns READY, animate it into the banner
and highlight it for 10 s; optional chime (off by default, ?sound=1); respects
prefers-reduced-motion.
B8 States: empty ("No orders right now"), kitchen closed (outside the time slot), reconnecting,
and the token-missing error page.
B9 Themes: light default, dark via ?theme=dark, both matching the reference.
B10 Polish: 1920×1080 and 1280×720 checks, long-run test (2 h of mock data, no memory growth),
and a README section on setting up a TV in Chrome kiosk mode.

# LOOP — repeat until every task is [x] or [blocked]

1. Open BOARD-PROGRESS.md at the repo root. If it doesn't exist, create it with B0–B10 as [ ],
   plus "Decisions", "TODO(api)", "Blocked" sections.
2. Take the first [ ] task and write a 3–5 line plan.
3. Re-read the matching part of OrderBoard.dc.html and the code you'll touch.
4. Implement the task.
5. Verify: pnpm --filter @aahar/admin-portal lint (0 warnings), then typecheck, test and
   build. Run the portal, open /fandb/board/<restaurantId>?token=… with the mock feed, and check
   it at 1920×1080 in both themes. Use screenshot tooling if you have it. Fix any difference
   from the reference and any overflow.
6. After 3 failed attempts on the same problem, mark the task [blocked] with the error and what
   you tried, and move on.
7. Mark [x], write a 1–2 line summary, and commit.
8. Continue with the next task. Ask the user only if something would touch backend APIs,
   permissions or patient data. Otherwise choose the safest option and log it.

# DONE WHEN

The board runs full-screen at 1920×1080. It matches the reference in light and dark, updates
live from the mock (or real) feed, handles empty, closed and reconnecting states, never
overflows, and passes lint, typecheck, test and build. Finish with a short report: files
added, decisions, TODO(api) items, blocked items.
