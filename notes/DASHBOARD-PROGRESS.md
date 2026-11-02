# AAHAR Dashboard v3 — progress

Reference: `design-reference/Dashboard.dc.html`. Portal: `frontend/apps/admin-portal`.
BACKEND_ALLOWED: no — every number is computed in the portal from the existing list endpoints.
One task per commit.

## Tasks

- [x] D0 Tokens check and greeting fix
  - Plan: status and tile tokens already exist (UI v2); add the reference's chart colours (sFull,
    sPart, sRej, sPend, series, wLine) and ring as `--ds-chart-*` / `--ds-ring` with light and
    dark values, mapped to `ds.chart.*` / `ds.ring` in Tailwind. Let the greeting wrap.
  - Done. Fills (sparkline, wastage area) use opacity modifiers on the same tokens, so no rgba
    tokens are needed. The heading now wraps long names (checked a 50-character name at 390px:
    three lines, no overflow). "Super Adm" is not a truncation: that is the account's stored
    name (the access token says so; the seed's "Super Admin" was edited), so no data changed.
- [x] D1 Data layer (`hooks/use-dashboard-stats.ts`)
  - Plan: a pure module `lib/dashboard-stats.ts` (periods and buckets, transfer / pending /
    wastage / vendor / location stats, deltas, insights, setup steps, mode) with a node test,
    and a hook that runs one query per source in parallel and derives everything with useMemo.
  - Done. Sources: transfers since the start of the previous period (outcomes, counts, time to
    acknowledge, top items, rejection reasons, per location), pending transfers now, posted
    productions since the previous period (wastage), posted GRNs in the period (vendors), the
    existing queue / activity / expiring / master-total queries (same keys), and limit-1 counts
    for the setup checklist. Each list fetches page 1, then the rest in parallel (up to 10
    pages). `scripts/dashboard-stats.test.mjs` covers windows, outcomes, every stat, deltas,
    insights, locations, setup and mode; it fails when the good / bad direction is flipped.
    The portal `test` script now runs every `scripts/*.test.mjs` through `node --test`.
- [x] D2 Chart and dashboard components
  - Plan: plain SVG / HTML, ds-\* tokens only (fills via opacity modifiers), an aria-label
    summary on every chart, tabular numbers, and a usage comment at the top of each file.
  - Done. `components/charts/`: Sparkline, StackedBarChart (bars are buttons; hover, focus or
    tap fills the polite detail line), DonutChart, TrendLine (dashed threshold), HorizontalBarList
    (labels are permission-aware RecordLinks), SplitBar, plus `geometry.ts` for the line maths.
    `components/dashboard/`: KpiCard (skeleton at final height), InsightCard (tone has an icon
    and screen-reader text, not just colour), SortableTable (ARIA table roles, aria-sort, totals
    footer pinned to the bottom), SetupChecklist (progressbar), WorkQueueCard (ARIA tabs with
    arrow / Home / End). No demo page: the repo has no Storybook or dev-only route, so per the
    brief the demo is skipped; each component is checked on the dashboard itself from D3 on.
- [x] D3 Header, insights and KPI row
  - Plan: the page reads everything from `useDashboardStats`; the period lives in the URL
    (`?days=7|30|90`); insights and four KpiCards replace the old range switch and tiles. The
    lower sections keep working on the hook's data until D5 / D6 replace them.
  - Done. Header: date line, wrapping greeting, period switch, "Review pending (n)". Insights:
    up to three, skeletons while their sources load. KPIs: Transfers (delta vs previous period,
    info colour, sparkline, "% accepted in full"), Pending acknowledgement ("n over 1 h" chip,
    oldest record), Avg time to acknowledge (down is good), Kitchen wastage (points delta, down is
    good, target 5%). Footers pin to the card bottom so a row lines up. Links: `?date=7d|30d|90d`,
    `?view=PENDING_ACKNOWLEDGEMENT`, `?view=ACKNOWLEDGED&date=…`, productions `?view=POSTED`; the
    Transfers list gained a "Last 90 days" option for them. Checked live data at 1440 light and
    390 dark (no sideways scroll).
- [x] D4 Transfers-by-outcome row; wastage / items / vendors row
  - Plan: a shared DashboardCard shell; row 1 StackedBarChart (per day, per week for 90) +
    DonutChart with "within 1 h" and top rejection reason; row 2 TrendLine (5% line),
    HorizontalBarList of items, vendors with SplitBar. Each card only with its view permission.
  - Done. Subtitle counts link to the filtered lists (`?date=`, `?view=ACKNOWLEDGED&date=`),
    items to their record, vendors to GRNs searched for them, the highest-wastage item to its
    production. The wastage chip counts days on which any kitchen went over the limit, so it
    agrees with the warning insight (the all-kitchen average can hide one kitchen). Checked with
    a browser-only mock of a busy week (144 transfers, 28 productions, 22 GRNs) in light and
    dark: matches the reference. Rows are explicit: below 1100px every row is one column, KPIs
    are two-by-two until 1280px; measured at 390 / 768 / 1099 / 1100 / 1440, no card sits
    beside a gap and nothing scrolls sideways.
- [x] D5 Work queue and Expiring soon row
  - Plan: one WorkQueueCard with "Needs your action" and "Recent activity" tabs (replacing the
    queue panel and the separate activity card) beside an Expiring soon card; the row stretches
    and each card grows, so both end level.
  - Done. Tasks are oldest first (a pending transfer's age runs from its dispatch), with kind
    tiles (TRF / GRN / PRD), the record number as a link, its status, age (the oldest in amber)
    and the action; "You're all caught up" when empty. Each tab's "View all" opens the list with
    the most waiting (pending transfers, draft GRNs or draft productions). Expiring soon lists
    store stock within 7 days (red within 2 days), items link to their record, "Open store
    stock" opens `?view=NEAR_EXPIRY` and sits at the card bottom. The page body is now small
    row components; Quick create and Master data sit in an interim row until D6. Checked with
    the mock in light and dark at 1440: both cards 249px tall; arrow keys move between tabs.
- [x] D6 Locations table, Quick create and Master data column
  - Plan: SortableTable of one row per location (hospital) with a pinned "All locations" row,
    beside Quick create over the unchanged Master data card; the table card grows to the
    column's height.
  - Done. Columns: location (tile + name), transfers with a share bar, pending (amber chip when
    any), avg ack time (amber over 60 min), wastage (amber from 4.5%); sorted by transfers, any
    header re-sorts (aria-sort). Every value links to that location's filtered list: the
    Transfers and Production lists now keep their page-level Location filter in the URL
    (`?hospital=`, the top-bar location still wins). Master data is the previous card,
    unchanged. Checked with the mock at 1440: table and column both 525px, totals row 1px from
    the card bottom; a real `?hospital=` link selects that location on both lists.
- [x] D7 "New workspace" mode and the switching rule
  - Plan: `dashboardMode` (D1) picks "new" when nothing was sent in the period and a setup
    step is unfinished; the page then shows the checklist, plain KPIs and the explainer +
    activity row beside Quick create and Master data, and the header offers the first transfer.
  - Done. Checklist from real counts (11 steps; only the ones the user can see; a step's call to
    action only where the user may open its create page; the first unfinished step is
    highlighted). KPIs: Transfers and Kitchen production for the period, Pending and GRNs to
    verify now, with no sparkline or delta; footers name the last record ("Your last transfer,
    TRF0001, was on 22 Sept", "GRN000001 posted to Main Store", "PRD0001 posted on 22 Sept").
    The work queue opens on Recent activity. Checked by zeroing two setup counts in the
    browser (item prices, menus) on the real, quiet week: 9 of 11 done, light 1440 and dark 390.
- [x] D8 Polish
  - Plan: an error state per card, one tab stop for the outcome bars, skeletons at final
    size, then light / dark at 1440 / 1100 / 768 / 390 and a keyboard walkthrough.
  - Done. A failed source no longer leaves zeros or endless skeletons: KPI cards read "—" with
    a red note at their usual height, every other card shows "Could not load this" with Try
    again (checked by failing the stats, queue and stock calls with 500s: 7 cards and 4 KPIs).
    The outcome bars are one tab stop; arrows, Home and End move and update the detail line (30
    bars, checked). Tab walk: 86 stops in a logical order (period, Review pending, insights,
    KPIs, chart, links, tabs, queue, stock, table, quick create, master data), every one with a
    visible focus ring. Skeletons resized to the cards they stand for (outcomes 364px, trends
    330px, insights 72px). Checked at 1440 light / dark, 1100, 768 dark (full page, one column,
    the page ends 20px below the last card) and 390 dark; 90 days shows 13 weekly bars.

## Decisions

- Commit subjects read `feat(portal): <description> (D<n>)`: commitlint rejects a subject that
  starts with a capital, so the brief's `D3 transfers outcome chart` form cannot pass.
- The greeting shows the name exactly as stored. The dev Super Admin reads "Super Adm" because
  that is its name in the database; renaming the user is a data change, left to an admin.

- Stats are computed in the portal from the list endpoints (BACKEND_ALLOWED: no). Outcomes come
  from each transfer's lines (`transferOutcome`, now shared with the Transfers page), and time
  to acknowledge from the transfer itself, so the acknowledgements endpoint is not needed.
- "Transfers" counts sent transfers (pending or acknowledged) by transfer date; drafts and
  cancelled ones are left out of the KPI and the outcome chart.
- Periods are whole local days ending today (7 and 30 per day, 90 per week, 13 bars); deltas
  compare with the equally long period before.
- Expiring soon reads store stock balances (what is left), not GRN batches: a batch that has
  already been used up should not warn.
- The dashboard period is a URL param (`?days=`), like the list filters, so a refresh or a
  shared link keeps it.
- "Locations" are hospitals (the top-bar location's level). With one location selected the
  table shows that one row and its totals.
- The Transfers and Production lists' page-level Location filter moved into the URL
  (`?hospital=`) so the locations table can link to one location's list. Previously local
  (an N3 decision); the top-bar location still overrides it.
- The period switch stays visible in the new-workspace view (the reference hides it): the mode
  depends on the period, so a quiet week with older transfers can still be looked back on.
- Until the mode is known (transfers and setup counts loaded) the live layout's skeletons show;
  a new workspace then swaps to its view once, a shift only new workspaces see.
- Wastage is wasted / produced quantity across posted productions, weighted by quantity, not
  an average of daily percentages.

## TODO(api)

- `Transfer.dispatchedAt` (or an acknowledgement time on the transfer): time to acknowledge
  uses `createdAt` as the send time, so a draft sent later reads slower than it was.
- `GET /dashboard/summary?hospitalId&days=`: the portal fetches up to 10 pages of 100 per
  source; a busier period is counted from its newest 1,000 records (the hook reports
  `truncated`).
- Audit-log read endpoint: activity shows what changed, not who changed it.
- Time slots are not location-scoped, so the setup step counts them across all locations.
