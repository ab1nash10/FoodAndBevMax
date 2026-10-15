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
- [ ] B3 Header
- [ ] B4 Now ready banner + Ready grid
- [ ] B5 Preparing column + How it works
- [ ] B6 Footer legend
- [ ] B7 Live behaviour
- [ ] B8 States
- [ ] B9 Themes
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

## TODO(api)

None open: the api adapter reads the real feed. Senders (POS, kiosk, QR) should add
`serviceType`, `counterCode` and `prepMinutes` to each order for the full board; without them
a tile shows no icon or counter and the estimate is 10 minutes from the order.

## Blocked
