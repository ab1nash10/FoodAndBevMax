# Order status board — progress

Prompt: `order-board.md`. Settings used: DATA_SOURCE api (real orders, user's choice; mock via
`?demo=1`), REFRESH polling every 3 s, THEME_DEFAULT light.

- [x] B0 Tokens: board colours map to portal tokens; added `ds-ready-banner` (light + dark).
      Contrast checked in both themes, all pairs ≥ 5.2:1.
- [x] B1 Data layer: GET /order-board/:restaurantId?token= returns the BoardFeed contract;
      optional serviceType / counterCode / prepMinutes on POST /orders (one additive migration);
      lib/order-board rules, mock simulation and useBoardFeed, with unit tests.
- [x] B2 Route + canvas: app/(display)/board/[restaurantId] outside the admin shell; a fixed
      1920×1080 canvas scaled to fit (letterboxed on black), cursor hidden, no text selection.
- [x] B3 Header: AAHAR and Max logos, restaurant and location, "Lunch · till 3:00 PM" slot pill,
      clock on the server's time in India time.
- [x] B4 Now ready banner (160 px number) + "Ready to collect" grid (3×2, 80 px numbers, counter,
      eat here / take away, "Ready n min ago" or amber "n min · collect soon", "+N more").
- [x] B5 Preparing column (3×3, 52 px numbers, eat here / take away icon, "~n min", "+N more")
      and the How it works panel. Checked at 1920×1080 and 1280×720 on the mock feed.
- [x] B6 Footer: eat here / take away legend, "Kept for 15 min once ready", staff ID note, "Can't
      see your number? Ask at <first counter>". HOLD_MINUTES / COLLECT_SOON_MINUTES in rules.ts.
- [x] B7 Live: 3 s polling with back-off; a newly ready order slides into the banner and glows for
      10 s (not what is ready when the screen opens); ?sound=1 chime; reduced motion = outline
      only; screen wake lock.
- [x] B8 States: no link, invalid link, loading, never-connected, empty ("No orders right now" +
      how it works), kitchen closed ("Opens at 7:00 PM"), and a Reconnecting… badge over the last
      data. Long counter names shorten with "…".
- [x] B9 Themes: light by default, ?theme=dark, whatever portal theme the device has stored.
- [ ] B10 Polish

## Decisions

- **Design source.** `design-reference/kiosk/OrderBoard.dc.html` does not exist in the repo;
  the user's screenshot of the board is the reference, with `design-reference/Palette.dc.html`
  and `app/globals.css` for colours.
- **Colour tokens.** Preparing = `ds-status-info-*` (#E8F0FA / #0B57A4), Ready = `ds-teal-*`
  (#E7F6F1 / #0F6B55), waiting too long = `ds-status-pending-*` (#FEF3C7 / #92400E), header =
  `ds-brand-panel` (#0B57A4). Only the banner had no token: `ds-ready-banner` (#0F7B63; dark
  #0F766E). Contrast, light / dark: header 7.2 / 18.2, banner 5.2 / 5.5, preparing chip 6.3 /
  8.3, ready tile 5.8 / 9.8, amber 6.4 / 10.1.

- **Data source.** DATA_SOURCE is `api` (the user chose real orders); `?demo=1` runs the
  moving mock feed. The feed adds four fields to the prompt's contract: `isOpen` and `opensAt`
  (kitchen closed state), `helpCounterName` (the help line) - all derived on the server.
- **Device token.** The board URL is `/board/<restaurantId>?token=<board secret>`; the API takes
  the secret as `?token=` or an `x-board-token` header, and it must match the restaurant. The
  portal sends the query parameter (a custom header would need a CORS preflight). Replacing the
  secret (Restaurants > Activity > New link) turns old links off.
- **Meal slot and open hours.** From the restaurant (active, not offline, opening hours unless
  open 24x7) and the location's timed Time Slots, in India time on the server.
- **Estimate.** `estimatedReadyAt` = placed time + the sender's `prepMinutes`, else 10 minutes.

- **Checking it locally.** A running `next dev` keeps the removed /board/[token] route in its
  manifest and 404s the new one until restarted, so checks run on `next build` + `next start`.

- **B7–B9 in one commit.** All three are wired through the same lines of the board's root
  component, so separate commits would not each have worked on their own.
- **Verification.** board-states check (17 cases: every state, live glow and its 10 s end,
  reduced motion, both themes, a busy board with 3-digit numbers and long counter names at
  1920×1080 and 1280×720) against made-up feeds answered in the browser.

## TODO(api)

None open: the api adapter reads the real feed. Senders (POS, kiosk, QR) should add
`serviceType`, `counterCode` and `prepMinutes` to each order for the full board; without them
a tile shows no icon or counter and the estimate is 10 minutes from the order.

## Blocked
