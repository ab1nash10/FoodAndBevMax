# Order status board — progress

Prompt: `order-board.md`. Settings used: DATA_SOURCE api (real orders, user's choice; mock via
`?demo=1`), REFRESH polling every 3 s, THEME_DEFAULT light.

- [x] B0 Tokens: board colours map to portal tokens; added `ds-ready-banner` (light + dark).
      Contrast checked in both themes, all pairs ≥ 5.2:1.
- [ ] B1 Data layer
- [ ] B2 Route + 1920×1080 canvas
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

## TODO(api)

## Blocked
