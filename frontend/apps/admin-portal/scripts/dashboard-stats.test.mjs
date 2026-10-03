// Dashboard numbers come from client-side aggregation, so a wrong bucket or a flipped
// "lower is better" silently misreports the business. Run with node's type stripping so the
// check reads the real module.
import assert from 'node:assert/strict';
import {
  ackMinutes,
  dashboardMode,
  formatMinutes,
  insights,
  locationRows,
  outcomeOf,
  pendingStats,
  percentDelta,
  periodWindow,
  pointsDelta,
  setupSteps,
  transferOutcome,
  transferStats,
  vendorRows,
  wastageStats,
} from '../lib/dashboard-stats.ts';

const now = new Date(2026, 9, 1, 14, 30); // Thu 1 Oct 2026, 14:30 local
const at = (daysAgo, hour = 10, minute = 0) => {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const saket = {
  displayName: 'Max Saket',
  hospitalCode: 'MAX-SKT',
  hospitalName: 'Max Saket',
  id: 'h1',
  isActive: true,
};
const vaishali = {
  hospitalCode: 'MAX-VSH',
  hospitalName: 'Max Vaishali',
  id: 'h2',
  isActive: true,
};
const item = (id, itemName) => ({
  id,
  isActive: true,
  itemCode: id,
  itemName,
  itemType: 'MRP',
  type: 'VEG',
});
const milk = item('i1', 'Toned milk');
const rice = item('i2', 'Basmati rice');
const line = (it, sent, accepted = sent, rejected = 0, rejectionReason = null) => ({
  acceptedQty: accepted,
  item: it,
  itemId: it.id,
  rejectedQty: rejected,
  rejectionReason,
  sentQty: sent,
});
let serial = 0;
const transfer = ({
  created,
  hospital = saket,
  lines = [line(milk, 10)],
  sent,
  status = 'ACKNOWLEDGED',
  updated,
}) => {
  serial += 1;
  return {
    createdAt: created ?? sent,
    hospital,
    hospitalId: hospital.id,
    id: `t${serial}`,
    lines,
    status,
    transferDate: sent,
    transferNumber: `TRF${String(serial).padStart(4, '0')}`,
    updatedAt: updated ?? sent,
  };
};

// ---- Period windows: whole local days, per day (7, 30) or per week (90).
const week = periodWindow(7, now);
assert.equal(week.buckets.length, 7);
assert.equal(new Date(week.start).getDate(), 25);
assert.equal(new Date(week.start).getHours(), 0);
assert.equal(week.buckets[0].label, 'Fri 25');
assert.equal(week.buckets[6].label, 'Thu 1');
assert.equal(week.prevStart, new Date(2026, 8, 18).getTime());
const month = periodWindow(30, now);
assert.equal(month.buckets.length, 30);
assert.equal(
  month.buckets.filter((b) => b.label).length,
  7,
  'every fifth day and the last are labelled',
);
assert.ok(
  month.buckets.every((b) => b.fullLabel),
  'every day has a full label',
);
const quarter = periodWindow(90, now);
assert.equal(quarter.buckets.length, 13);
assert.ok(quarter.buckets[0].fullLabel.startsWith('Week of '));
assert.equal(
  quarter.buckets.at(-1).end,
  new Date(2026, 9, 2).getTime(),
  'the last week ends tonight',
);

// ---- Outcomes come from the lines; drafts and cancelled transfers have none.
assert.equal(transferOutcome(transfer({ sent: at(0) })), 'ACCEPTED_FULL');
assert.equal(
  transferOutcome(transfer({ lines: [line(milk, 10, 8, 2)], sent: at(0) })),
  'ACCEPTED_PARTIAL',
);
assert.equal(
  transferOutcome(transfer({ lines: [line(milk, 10, 0, 10)], sent: at(0) })),
  'REJECTED_FULL',
);
assert.equal(outcomeOf(transfer({ sent: at(0), status: 'PENDING_ACKNOWLEDGEMENT' })), 'pending');
assert.equal(outcomeOf(transfer({ sent: at(0), status: 'DRAFT' })), null);
assert.equal(outcomeOf(transfer({ sent: at(0), status: 'CANCELLED' })), null);
assert.equal(
  ackMinutes(transfer({ created: at(0, 9), sent: at(0, 9), updated: at(0, 9, 45) })),
  45,
);
assert.equal(ackMinutes(transfer({ sent: at(0), status: 'PENDING_ACKNOWLEDGEMENT' })), null);

// ---- Transfer stats for a week.
const transfers = [
  transfer({ sent: at(0, 9), updated: at(0, 9, 30) }), // full, 30 min
  transfer({
    lines: [line(milk, 10, 8, 2, 'Short received'), line(rice, 5)],
    sent: at(0, 8),
    updated: at(0, 10),
  }), // partial, 120 min
  transfer({
    hospital: vaishali,
    lines: [line(rice, 4, 0, 4, 'short received ')],
    sent: at(2),
    updated: at(2, 10, 50),
  }), // rejected, 50 min
  transfer({ sent: at(1), status: 'PENDING_ACKNOWLEDGEMENT' }),
  transfer({ sent: at(1), status: 'DRAFT' }),
  transfer({ sent: at(3), status: 'CANCELLED' }),
  transfer({ sent: at(9), updated: at(9, 11) }), // previous week, 60 min
  transfer({ sent: at(12), updated: at(12, 12) }), // previous week, 120 min
  transfer({ sent: at(30) }), // before both periods
];
const stats = transferStats(transfers, week);
assert.equal(stats.count, 4, 'sent transfers only');
assert.equal(stats.prevCount, 2);
assert.deepEqual(stats.outcomes, { full: 1, partial: 1, pending: 1, rejected: 1 });
assert.deepEqual(stats.outcomeSeries[6], { full: 1, partial: 1, pending: 0, rejected: 0 });
assert.deepEqual(stats.outcomeSeries[5], { full: 0, partial: 0, pending: 1, rejected: 0 });
assert.deepEqual(stats.countSeries, [0, 0, 0, 0, 1, 1, 2]);
assert.equal(stats.ackAvgMinutes, (30 + 120 + 50) / 3);
assert.equal(stats.ackPrevAvgMinutes, 90);
assert.equal(stats.ackWithinHour, 2 / 3);
assert.equal(stats.ackSeries[6], 75);
assert.equal(stats.ackSeries[0], null);
assert.equal(
  stats.topRejectionReason,
  'Short received',
  'reasons are counted case- and space-insensitively',
);
assert.deepEqual(
  stats.topItems.map((i) => `${i.name}:${i.count}`),
  ['Toned milk:3', 'Basmati rice:2'],
);
assert.equal(stats.hospitals.get('h1').count, 3);
assert.equal(stats.hospitals.get('h2').count, 1);

// ---- Pending right now: age from the dispatch (updatedAt).
const pendingList = [
  transfer({ sent: at(0, 9), status: 'PENDING_ACKNOWLEDGEMENT', updated: at(0, 12, 20) }), // 2h 10m
  transfer({ sent: at(0, 9), status: 'PENDING_ACKNOWLEDGEMENT', updated: at(0, 14) }), // 30m
  transfer({
    hospital: vaishali,
    sent: at(0, 9),
    status: 'PENDING_ACKNOWLEDGEMENT',
    updated: at(0, 13),
  }), // 1h 30m
];
const pending = pendingStats(pendingList, 8, now.getTime());
assert.equal(pending.total, 8, 'the total comes from the API, not the page');
assert.equal(pending.overHour, 2);
assert.equal(pending.oldest.id, pendingList[0].id);
assert.equal(pending.hospitals.get('h1'), 2);

// ---- Wastage: weighted by quantity, per bucket, with the limit.
const production = (
  daysAgo,
  lines,
  kitchen = { id: 'k1', kitchenName: 'Main Kitchen' },
  status = 'POSTED',
) => ({
  hospital: saket,
  hospitalId: saket.id,
  id: `p${(serial += 1)}`,
  kitchen,
  kitchenId: kitchen.id,
  lines: lines.map(([it, producedQty, wastageQty]) => ({
    item: it,
    itemId: it.id,
    producedQty,
    wastageQty,
  })),
  productionDate: at(daysAgo),
  status,
});
const productions = [
  production(0, [
    [milk, 100, 2],
    [rice, 100, 4],
  ]), // 3%
  production(2, [[rice, 50, 4]]), // 8% — over the limit
  production(1, [[milk, 100, 50]], undefined, 'DRAFT'), // ignored
  production(10, [[milk, 100, 6]]), // previous period, 6%
];
const wastage = wastageStats(productions, week);
assert.equal(wastage.avgPercent, (10 / 250) * 100);
assert.equal(wastage.prevAvgPercent, 6);
assert.equal(wastage.series[6], 3);
assert.equal(wastage.series[4], 8);
assert.equal(wastage.series[0], null);
assert.equal(wastage.overLimit, 1);
// One kitchen over the limit on a day counts, even when the day's all-kitchen average is under it.
const mixed = wastageStats(
  [
    production(1, [[milk, 100, 9]], { id: 'k1', kitchenName: 'Main Kitchen' }),
    production(1, [[milk, 900, 9]], { id: 'k2', kitchenName: 'Staff Kitchen' }),
  ],
  week,
);
assert.ok(Math.abs(mixed.series[5] - 1.8) < 1e-9, 'the day average stays under the limit');
assert.equal(mixed.overLimit, 1);
assert.equal(wastage.highest.itemName, 'Basmati rice');
assert.equal(wastage.highest.percent, 8);
assert.equal(wastage.worstKitchenDay.kitchenName, 'Main Kitchen');
assert.equal(wastage.worstKitchenDay.percent, 8);
assert.equal(wastage.kitchens, 1);
assert.equal(wastage.posted, 2, 'drafts and the previous period are not counted');

// ---- Vendors: posted GRNs in the period, flagged above 5% rejected.
const grn = (vendorName, accepted, rejected, daysAgo = 1, status = 'POSTED_TO_STOCK') => ({
  lines: [{ acceptedQty: accepted, rejectedQty: rejected }],
  receivedDate: at(daysAgo),
  status,
  vendorName,
});
const vendors = vendorRows(
  [
    grn('Shree Dairy', 91, 9),
    grn('Shree Dairy', 100, 0),
    grn('Metro Wholesale', 99, 1),
    grn(' metro wholesale', 50, 0),
    grn('Old Vendor', 10, 10, 20),
    grn('Draft Vendor', 10, 10, 1, 'DRAFT'),
    grn(null, 5, 0),
  ],
  week,
);
assert.deepEqual(
  vendors.map((v) => `${v.name}:${v.grns}:${v.flagged}`),
  ['Shree Dairy:2:false', 'Metro Wholesale:2:false', 'No vendor:1:false'],
);
assert.equal(Math.round(vendorRows([grn('Bad Farms', 90, 10)], week)[0].acceptedPercent), 90);
assert.equal(vendorRows([grn('Bad Farms', 90, 10)], week)[0].flagged, true);

// ---- Deltas: colour follows which direction is good.
assert.deepEqual(percentDelta(112, 100, 'none'), { text: '▲ 12%', tone: 'info' });
assert.deepEqual(percentDelta(41, 50, 'down'), { text: '▼ 18%', tone: 'good' });
assert.deepEqual(percentDelta(60, 50, 'down'), { text: '▲ 20%', tone: 'bad' });
assert.equal(percentDelta(5, 0, 'none'), null, 'no previous value, no delta');
assert.equal(percentDelta(null, 5, 'down'), null);
assert.deepEqual(pointsDelta(3.1, 3.7), { text: '▼ 0.6 pts', tone: 'good' });
assert.deepEqual(pointsDelta(4.2, 4.0), { text: '▲ 0.2 pts', tone: 'bad' });
assert.equal(formatMinutes(38.4), '38 min');
assert.equal(formatMinutes(130), '2h 10m');
assert.equal(formatMinutes(0.2), '<1 min');
assert.equal(formatMinutes(null), '—');

// ---- Insights: one of each tone when there is one, nothing invented.
const cards = insights({
  pending,
  period: 7,
  transfers: { ...stats, ackAvgMinutes: 41, ackPrevAvgMinutes: 50 },
  vendors: vendorRows([grn('Bad Farms', 90, 10)], week),
  wastage,
});
assert.deepEqual(
  cards.map((c) => c.tone),
  ['good', 'warning', 'bad'],
);
assert.match(cards[0].title, /18% faster than the previous week/);
assert.match(cards[1].title, /Main Kitchen, Max Saket wasted 8\.0% on Tuesday/);
assert.equal(cards[1].href, '/kitchen/productions?view=POSTED&kitchen=k1');
assert.match(cards[2].title, /Bad Farms: 10% of quantity rejected/);
assert.equal(insights({ period: 7 }).length, 0, 'no data, no cards');
const quiet = insights({
  period: 30,
  wastage: wastageStats([production(0, [[milk, 100, 1]])], month),
});
assert.deepEqual(
  quiet.map((c) => c.tone),
  ['good'],
);

// ---- Locations: a row per hospital with any activity, totals weighted.
const table = locationRows(stats, pending, wastage, new Map());
assert.deepEqual(table.rows.map((r) => `${r.name}:${r.transfers}:${r.pending}`).sort(), [
  'Max Saket:3:2',
  'Max Vaishali:1:1',
]);
assert.equal(table.totals.transfers, 4);
assert.equal(table.totals.pending, 8);
assert.equal(table.totals.ackAvgMinutes, stats.ackAvgMinutes);

// ---- Setup checklist and the mode rule.
const canOpenAll = () => true;
const fresh = setupSteps(
  { hospitals: 6, items: 3, itemPrices: 0, kitchenItems: 0, storeItems: 2, stores: 11 },
  { grn: null, transfer: undefined },
  canOpenAll,
);
assert.deepEqual(
  fresh.map((s) => `${s.key}:${s.done ? 'done' : s.doing ? 'doing' : 'todo'}`),
  ['hospitals:done', 'stores:done', 'items:done', 'itemPrices:doing', 'mappings:todo', 'grn:todo'],
  'unseen counts are left out; the first unfinished step is the next one',
);
assert.equal(fresh.find((s) => s.key === 'mappings').cta.href, '/masters/kitchen-items');
assert.equal(
  fresh.find((s) => s.key === 'hospitals').cta,
  undefined,
  'done steps have no call to action',
);
const noCreate = setupSteps({ items: 0 }, {}, () => false);
assert.equal(noCreate[0].cta, undefined, 'no call to action the user cannot open');
assert.equal(dashboardMode({ canSeeTransfers: true, steps: fresh, transfersInPeriod: 0 }), 'new');
assert.equal(dashboardMode({ canSeeTransfers: true, steps: fresh, transfersInPeriod: 3 }), 'live');
assert.equal(dashboardMode({ canSeeTransfers: false, steps: fresh, transfersInPeriod: 0 }), 'live');
const finished = fresh.map((s) => ({ ...s, done: true }));
assert.equal(
  dashboardMode({ canSeeTransfers: true, steps: finished, transfersInPeriod: 0 }),
  'live',
);

console.log('dashboard-stats ok');
