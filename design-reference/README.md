# AAHAR UI v2 — design reference

HTML mockups exported from the design canvas. They are the visual spec only: do not copy their
markup or inline styles into the app. Rebuild each screen with the portal's own components and
Tailwind `ds-*` tokens.

Each file holds BOTH themes: the `pal(t)` method in its script block lists the exact light and
dark colour values the screen uses. The sample data in `renderVals()` is illustrative only.

| File                            | Screen                                                                                    | Portal route                    |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| Login.dc.html                   | Sign in (email & password, mobile OTP)                                                    | /auth/login                     |
| Sidebar.dc.html, Topbar.dc.html | App shell                                                                                 | components/admin-shell.tsx      |
| Dashboard.dc.html               | Dashboard v3 — two states via the `mode` prop: `live` (stats) and `new` (setup checklist) | /dashboard                      |
| Transfers.dc.html               | Transfers list + detail panel                                                             | /inventory/transfers            |
| NewTransfer.dc.html             | New transfer                                                                              | /inventory/transfers/new        |
| Acknowledge.dc.html             | Acknowledge a transfer                                                                    | transfer acknowledgement flow   |
| Grn.dc.html                     | GRN verification                                                                          | /inventory/grns                 |
| Items.dc.html                   | Items master + detail panel                                                               | /masters/items                  |
| Production.dc.html              | Kitchen production entry                                                                  | /kitchen/productions/new        |
| Palette.dc.html                 | Command palette (Ctrl K)                                                                  | global, from the top bar search |
