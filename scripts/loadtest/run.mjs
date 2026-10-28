// Load test: N people signed in at once, each opening the screens of their role the way the portal
// does (the same API calls, fired together like the browser, ≤6 connections per service), resting
// between screens, and running the background polls an open tab runs. Local stack only: it signs
// in with the dev OTP (no SMS) as the users from seed-users.sql.
//
//   node scripts/loadtest/run.mjs [--users 1000] [--ramp 120] [--hold 360] [--old]
//
// --old replays the portal's calls before the 2026-10-27 fixes (a count request per status tab,
// /hospitals on every inventory screen, 30 s session checks, 10 s kiosk polls). Both modes keep
// each person's browser cache: a call is skipped while the portal would still hold it as fresh.
//
// Writes scripts/loadtest/results/<time>.json and prints a summary.
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const USERS = arg('users', 1000);
const RAMP_S = arg('ramp', 120);
const HOLD_S = arg('hold', 360);
const OLD = process.argv.includes('--old');
// The POS opens only on a till, for users of its restaurant's location: the load users work at
// the location of the till this computer is (seed-users.sql puts them there).
const LOCATION = 'Max-Smart';
const AUTH = 'http://localhost:4001/api/v1';
const USER = 'http://localhost:4002/api/v1';
const ORG = process.env.ORG_URL ?? 'http://localhost:4003/api/v1';

// ---- Who does what. Each screen is the list of GETs the portal fires when it opens (captured from
// the browser on 2026-10-27); {h} hospital, {c} counter, {r} restaurant, {k} kitchen, {d} today.
const screens = {
  dashboard: [
    'ORG/dashboard/location-names',
    'ORG/dashboard/records?fromDate={from14}&hospitalId={h}',
    'ORG/transfers?hospitalId={h}&limit=50&sortBy=createdAt&sortOrder=asc&status=PENDING_ACKNOWLEDGEMENT',
    'ORG/grns?hospitalId={h}&limit=20&sortBy=createdAt&sortOrder=asc&status=DRAFT',
    'ORG/kitchen-productions?hospitalId={h}&limit=20&sortBy=createdAt&sortOrder=asc&status=DRAFT',
    'ORG/transfers?hospitalId={h}&limit=6&sortBy=updatedAt&sortOrder=desc',
    'ORG/grns?hospitalId={h}&limit=6&sortBy=updatedAt&sortOrder=desc',
    'ORG/kitchen-productions?hospitalId={h}&limit=6&sortBy=updatedAt&sortOrder=desc',
    'ORG/stock-balances?hospitalId={h}&limit=20&sortBy=expiryDate&sortOrder=asc&status=NEAR_EXPIRY',
    'ORG/dashboard/setup?hospitalId={h}',
    'ORG/pos/summary?counterId={c}&date={d}',
  ],
  inventoryToday: [
    'ORG/store-stock/levels?hospitalId={h}',
    'ORG/store-stock/movements?days=14&hospitalId={h}',
    'ORG/restaurant-stock?hospitalId={h}&limit=5&status=OUT_OF_STOCK',
    'ORG/grns?fromDate={d}&hospitalId={h}&limit=10',
    'ORG/transfers?fromDate={d}&hospitalId={h}&limit=10',
  ],
  transfers: [
    'ORG/hospitals?isActive=true&limit=100&sortBy=hospitalName&sortOrder=asc',
    'ORG/stores?hospitalId={h}&isActive=true&limit=100&sortBy=storeName&sortOrder=asc',
    'ORG/kitchens?hospitalId={h}&isActive=true&limit=100&sortBy=kitchenName&sortOrder=asc',
    'ORG/restaurants?hospitalId={h}&isActive=true&limit=100&sortBy=restaurantName&sortOrder=asc',
    'ORG/dashboard/location-names',
    'ORG/transfers?destinationType=RESTAURANT&hospitalId={h}&limit=10&page=1&sortBy=createdAt&sortOrder=desc',
    ...[
      '',
      '&status=DRAFT',
      '&status=PENDING_ACKNOWLEDGEMENT',
      '&status=ACKNOWLEDGED',
      '&status=CANCELLED',
    ].map((s) => `ORG/transfers?destinationType=RESTAURANT&hospitalId={h}&limit=0${s}`),
  ],
  grns: [
    'ORG/hospitals?isActive=true&limit=100&sortBy=hospitalName&sortOrder=asc',
    'ORG/stores?hospitalId={h}&isActive=true&limit=100&sortBy=storeName&sortOrder=asc',
    'ORG/grns?hospitalId={h}&limit=10&page=1&sortBy=createdAt&sortOrder=desc',
    ...['', '&status=DRAFT', '&status=POSTED_TO_STOCK', '&status=CANCELLED'].map(
      (s) => `ORG/grns?hospitalId={h}&limit=0${s}`,
    ),
  ],
  stockLevels: ['ORG/store-stock/levels?hospitalId={h}'],
  storeStock: [
    'ORG/hospitals?isActive=true&limit=100&sortBy=hospitalName&sortOrder=asc',
    'ORG/stores?hospitalId={h}&isActive=true&limit=100&sortBy=storeName&sortOrder=asc',
    'ORG/items?limit=100&sortBy=itemName&sortOrder=asc',
    'ORG/store-stock/summary?hospitalId={h}&limit=10&locationType=STORE&page=1&sortBy=lastUpdatedOn&sortOrder=desc',
    ...['', '&status=NEAR_EXPIRY', '&status=EXPIRED', '&status=OUT_OF_STOCK'].map(
      (s) => `ORG/store-stock/summary?hospitalId={h}&limit=0&locationType=STORE${s}`,
    ),
  ],
  stockLedgers: [
    'ORG/hospitals?isActive=true&limit=100&sortBy=hospitalName&sortOrder=asc',
    'ORG/stores?hospitalId={h}&isActive=true&limit=100&sortBy=storeName&sortOrder=asc',
    'ORG/kitchens?hospitalId={h}&isActive=true&limit=100&sortBy=kitchenName&sortOrder=asc',
    'ORG/restaurants?hospitalId={h}&isActive=true&limit=100&sortBy=restaurantName&sortOrder=asc',
    'ORG/items?limit=100&sortBy=itemName&sortOrder=asc',
    'ORG/stock-ledgers?hospitalId={h}&limit=10&page=1&sortBy=transactionDateTime&sortOrder=desc',
    ...[
      '',
      '&referenceType=GRN',
      '&referenceType=TRANSFER',
      '&referenceType=TRANSFER_ACKNOWLEDGEMENT',
    ].map((s) => `ORG/stock-ledgers?hospitalId={h}&limit=0${s}`),
  ],
  productions: [
    'ORG/hospitals?isActive=true&limit=100&sortBy=hospitalName&sortOrder=asc',
    'ORG/kitchens?hospitalId={h}&isActive=true&limit=100&sortBy=kitchenName&sortOrder=asc',
    'ORG/kitchen-productions?hospitalId={h}&limit=10&page=1&sortBy=createdAt&sortOrder=desc',
    ...['', '&status=DRAFT', '&status=POSTED', '&status=CANCELLED'].map(
      (s) => `ORG/kitchen-productions?hospitalId={h}&limit=0${s}`,
    ),
  ],
  kitchenStock: [
    'ORG/hospitals?isActive=true&limit=100&sortBy=hospitalName&sortOrder=asc',
    'ORG/kitchens?hospitalId={h}&isActive=true&limit=100&sortBy=kitchenName&sortOrder=asc',
    'ORG/items?itemType=READYMADE&limit=100&sortBy=itemName&sortOrder=asc',
    'ORG/kitchen-stock?hospitalId={h}&itemType=READYMADE&limit=10&page=1&sortBy=lastUpdatedOn&sortOrder=desc',
    ...['', '&status=AVAILABLE', '&status=LOW_STOCK', '&status=OUT_OF_STOCK'].map(
      (s) => `ORG/kitchen-stock?hospitalId={h}&itemType=READYMADE&limit=0${s}`,
    ),
  ],
  kitchenTablet: [
    'ORG/kitchens?hospitalId={h}&isActive=true&limit=100&sortBy=kitchenName&sortOrder=asc',
    'ORG/kitchen-items?isActive=true&kitchenId={k}&limit=100',
    'ORG/kitchen-productions?fromDate={d}&kitchenId={k}&limit=100&sortBy=createdAt&sortOrder=desc&status=POSTED&toDate={d}',
    'ORG/time-slots?hospitalId={h}&isActive=true&limit=100',
  ],
  posBilling: [
    'ORG/pos/whoami',
    'ORG/pos/counters?till=true',
    'ORG/pos/menu?channel=COUNTER&counterId={c}',
    'ORG/pos/kiosk-orders?counterId={c}',
    'ORG/restaurant-orders?restaurantId={r}',
  ],
  posMenu: [
    'ORG/pos/whoami',
    'ORG/pos/counters?till=true',
    'ORG/pos/menu?channel=COUNTER&counterId={c}',
  ],
  posOrders: [
    'ORG/pos/whoami',
    'ORG/pos/counters?till=true',
    'ORG/restaurant-orders?restaurantId={r}',
  ],
  posHistory: [
    'ORG/pos/whoami',
    'ORG/pos/counters?till=true',
    'ORG/pos/orders?from={d}&hospitalId={h}&to={d}&limit=10&page=1&sortBy=placedAt&sortOrder=desc',
    ...['', '&status=CANCELLED', '&isComplimentary=true'].map(
      (s) => `ORG/pos/orders?from={d}&hospitalId={h}&to={d}${s}&limit=0`,
    ),
  ],
  posStock: [
    'ORG/pos/whoami',
    'ORG/pos/counters?till=true',
    'ORG/pos/stock-summary?counterId={c}&date={d}',
    'ORG/counter-stock/levels?locationId={c}',
  ],
  posDay: [
    'ORG/pos/whoami',
    'ORG/pos/counters?till=true',
    'ORG/pos/summary?counterId={c}&date={d}',
  ],
  items: [
    'ORG/items?limit=25&page=1&sortBy=createdAt&sortOrder=desc',
    ...['', '&itemType=MRP', '&itemType=READYMADE', '&isActive=false'].map(
      (s) => `ORG/items?limit=0${s}`,
    ),
  ],
  restaurants: [
    'ORG/restaurants?hospitalId={h}&limit=10&page=1&sortBy=createdAt&sortOrder=desc',
    ...['', '&isActive=true', '&isActive=false'].map(
      (s) => `ORG/restaurants?hospitalId={h}&limit=0${s}`,
    ),
  ],
  users: [
    'USER/users?hospitalId={h}&limit=50&page=1',
    'USER/roles?limit=100&page=1',
    ...['', '&status=ACTIVE', '&status=DISABLED'].map(
      (s) => `USER/users?hospitalId={h}&limit=1&page=1${s}`,
    ),
  ],
  reports: [
    'ORG/reports',
    'ORG/hospitals?isActive=true&limit=100&sortBy=hospitalName&sortOrder=asc',
    'ORG/restaurants?hospitalId={h}&isActive=true&limit=100&sortBy=restaurantName&sortOrder=asc',
  ],
};

// After the fixes: one request answers every status tab, and location pickers use the user's own
// locations (no /hospitals call).
if (!OLD) {
  const tabCounts = {
    grns: 'ORG/grns?hospitalId={h}&limit=0&statusCounts=true',
    productions: 'ORG/kitchen-productions?hospitalId={h}&limit=0&statusCounts=true',
    transfers: 'ORG/transfers?destinationType=RESTAURANT&hospitalId={h}&limit=0&statusCounts=true',
    // 2026-10-28: the remaining list screens.
    kitchenStock: 'ORG/kitchen-stock?hospitalId={h}&itemType=READYMADE&limit=0&statusCounts=true',
    posHistory: 'ORG/pos/orders?from={d}&hospitalId={h}&to={d}&limit=0&statusCounts=true',
    stockLedgers: 'ORG/stock-ledgers?hospitalId={h}&limit=0&referenceTypeCounts=true',
    storeStock:
      'ORG/store-stock/summary?hospitalId={h}&limit=0&locationType=STORE&statusCounts=true',
  };
  for (const [name, urls] of Object.entries(screens)) {
    screens[name] = urls.filter((url) => !url.startsWith('ORG/hospitals?'));
  }
  for (const [name, url] of Object.entries(tabCounts)) {
    screens[name] = [...screens[name].filter((u) => !u.includes('limit=0')), url];
  }
}

// How long the portal keeps an answer fresh (lib/query-client.ts and the hooks' own staleTime),
// so an open screen within that time asks nothing.
const staleFor = (url) => {
  // The POS gate asks once a session which till this computer is (staleTime Infinity).
  if (url.includes('/pos/whoami')) return Number.POSITIVE_INFINITY;
  if (url.includes('/pos/counters')) return OLD ? 30_000 : 120_000;
  if (/\/(stores|kitchens|restaurants|items)\?.*limit=100/.test(url)) return OLD ? 30_000 : 300_000;
  if (url.includes('/dashboard/records')) return 60_000;
  if (/sortOrder=asc&status=(DRAFT|PENDING_ACKNOWLEDGEMENT)/.test(url)) return 15_000;
  if (url.includes('/transfers?') && (url.includes('limit=0') || url.includes('statusCounts')))
    return 15_000;
  return 30_000;
};

// Screens per role, weighted by how often staff are on them; polls are what an open tab runs.
const roles = {
  cashier: {
    first: 'posBilling',
    // The billing screen: waiting kiosk orders (now only where the kiosk is in use, which the
    // test restaurant is not) and its open-orders panel (5 s before, 15 s now).
    polls: OLD
      ? [
          ['ORG/pos/kiosk-orders?counterId={c}', 10],
          ['ORG/restaurant-orders?restaurantId={r}', 5],
        ]
      : [['ORG/restaurant-orders?restaurantId={r}', 15]],
    screens: { posBilling: 5, posDay: 1, posHistory: 1, posMenu: 1, posOrders: 3, posStock: 1 },
  },
  inventory: {
    first: 'inventoryToday',
    polls: [],
    screens: {
      grns: 2,
      inventoryToday: 2,
      stockLedgers: 1,
      stockLevels: 1,
      storeStock: 2,
      transfers: 3,
    },
  },
  kitchen: {
    first: 'kitchenTablet',
    polls: [
      [
        'ORG/kitchen-productions?fromDate={d}&kitchenId={k}&limit=100&sortBy=createdAt&sortOrder=desc&status=POSTED&toDate={d}',
        60,
      ],
    ],
    screens: { kitchenStock: 1, kitchenTablet: 4, productions: 2 },
  },
  admin: {
    first: 'dashboard',
    polls: [['ORG/pos/summary?counterId={c}&date={d}', 60]],
    screens: {
      dashboard: 3,
      grns: 1,
      items: 1,
      reports: 1,
      restaurants: 1,
      transfers: 1,
      users: 1,
    },
  },
};
// Each block of 1,000 seeded users has the same mix (seed-users.sql).
const roleOf = (n) => {
  const k = ((n - 1) % 1000) + 1;
  return k <= 500 ? 'cashier' : k <= 750 ? 'inventory' : k <= 900 ? 'kitchen' : 'admin';
};
// Every signed-in tab: the sidebar counts each minute, and the session check.
const commonPolls = [
  ['ORG/dashboard/nav-counts?hospitalId={h}', 60],
  ['USER/users/me/access', OLD ? 30 : 120],
];
const THINK_MS = [10_000, 30_000];

// ---- Measurements.
const started = Date.now();
const calls = new Map(); // endpoint -> { ms: [], status: {} }
const screenTimes = new Map(); // screen -> ms[]
const timeline = []; // per 10 s: requests, errors, p95, users
const signIns = { ms: [], status: {} };
let windowMs = [];
let windowErrors = 0;
let activeUsers = 0;

const endpointOf = (url) => {
  const { pathname, searchParams } = new URL(url);
  const path = pathname
    .replace(/^\/api\/v1/, '')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')
    .replace(/\/\d+$/, '/:n');
  return `${url.includes(':4002') ? 'user' : url.includes(':4001') ? 'auth' : 'org'} GET ${path}${searchParams.get('limit') === '0' ? ' [count]' : ''}`;
};
const note = (bucket, key, ms, status) => {
  const entry = bucket.get(key) ?? { ms: [], status: {} };
  entry.ms.push(ms);
  entry.status[status] = (entry.status[status] ?? 0) + 1;
  bucket.set(key, entry);
  windowMs.push(ms);
  if (status === 0 || status >= 400) windowErrors += 1;
};

function request(agent, method, url, token, body) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      url,
      {
        agent,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(payload
            ? { 'content-length': Buffer.byteLength(payload), 'content-type': 'application/json' }
            : {}),
        },
        method,
        timeout: 30_000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString(),
            ms: performance.now() - t0,
            status: res.statusCode,
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) =>
      resolve({ error: error.message, ms: performance.now() - t0, status: 0 }),
    );
    req.end(payload);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = ([a, b]) => a + Math.random() * (b - a);
const pick = (weights) => {
  const entries = Object.entries(weights);
  let roll = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [name, w] of entries) if ((roll -= w) < 0) return name;
  return entries[0][0];
};

let ids;
const fill = (template) =>
  template
    .replace(/^ORG/, ORG)
    .replace(/^USER/, USER)
    .replace(/\{h\}/g, ids.h)
    .replace(/\{c\}/g, ids.c)
    .replace(/\{r\}/g, ids.r)
    .replace(/\{k\}/g, ids.k)
    .replace(/\{d\}/g, ids.d)
    .replace(/\{from14\}/g, ids.from14);

const stopAt = () => started + (RAMP_S + HOLD_S) * 1000;

async function signIn(agent, n) {
  const res = await request(agent, 'POST', `${AUTH}/auth/verify-otp`, null, {
    mobile: String(7000000000 + n),
    otp: '000000',
  });
  signIns.ms.push(res.ms);
  signIns.status[res.status] = (signIns.status[res.status] ?? 0) + 1;
  windowMs.push(res.ms);
  if (res.status !== 200 && res.status !== 201) {
    windowErrors += 1;
    return null;
  }
  return JSON.parse(res.body).data.accessToken;
}

async function openScreen(agent, token, name, fresh) {
  const t0 = performance.now();
  await Promise.all(
    screens[name].map(async (template) => {
      const url = fill(template);
      if ((fresh.get(url) ?? 0) > Date.now()) return;
      const res = await request(agent, 'GET', url, token);
      note(calls, endpointOf(url), res.ms, res.status);
      if (res.status === 200) fresh.set(url, Date.now() + staleFor(url));
    }),
  );
  const list = screenTimes.get(name) ?? [];
  list.push(performance.now() - t0);
  screenTimes.set(name, list);
}

async function poll(agent, token, template, everyS) {
  await sleep(Math.random() * everyS * 1000);
  while (Date.now() < stopAt()) {
    const url = fill(template);
    const res = await request(agent, 'GET', url, token);
    note(calls, endpointOf(url), res.ms, res.status);
    await sleep(Math.min(everyS * 1000, stopAt() - Date.now()));
  }
}

async function person(n) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
  const role = roles[roleOf(n)];
  const token = await signIn(agent, n);
  if (!token) return;
  activeUsers += 1;
  // App open: the shell's two calls, then the role's home screen.
  await Promise.all(
    [
      'USER/users/me/preferences',
      'USER/users/me/access',
      'ORG/dashboard/nav-counts?hospitalId={h}',
    ].map(async (t) => {
      const url = fill(t);
      const res = await request(agent, 'GET', url, token);
      note(calls, endpointOf(url), res.ms, res.status);
    }),
  );
  const fresh = new Map(); // this person's browser cache: url -> fresh until
  await openScreen(agent, token, role.first, fresh);
  const polls = [...commonPolls, ...role.polls].map(([t, s]) => poll(agent, token, t, s));
  while (Date.now() < stopAt()) {
    await sleep(between(THINK_MS));
    if (Date.now() >= stopAt()) break;
    await openScreen(agent, token, pick(role.screens), fresh);
  }
  await Promise.all(polls);
  activeUsers -= 1;
  agent.destroy();
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
const stats = (ms) => {
  const s = [...ms].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: Math.round(pct(s, 50)),
    p95: Math.round(pct(s, 95)),
    p99: Math.round(pct(s, 99)),
    max: Math.round(s.at(-1) ?? 0),
  };
};

async function resolveIds() {
  // The first admin load user looks up the location, its counter, restaurant and kitchen.
  const agent = new http.Agent({ keepAlive: true });
  const res = await request(agent, 'POST', `${AUTH}/auth/verify-otp`, null, {
    mobile: '7000000901',
    otp: '000000',
  });
  if (res.status >= 300)
    throw new Error(`setup sign-in failed (${res.status}): run seed-users.sql first`);
  const token = JSON.parse(res.body).data.accessToken;
  const get = async (url) => JSON.parse((await request(agent, 'GET', url, token)).body).data;
  const hospital = (await get(`${ORG}/hospitals?limit=100`)).items.find(
    (h) => h.hospitalName === LOCATION,
  );
  const counters = await get(`${ORG}/counters?hospitalId=${hospital.id}&limit=10`);
  const counter = (counters.items ?? counters)[0];
  const kitchen = (await get(`${ORG}/kitchens?hospitalId=${hospital.id}&limit=1`)).items[0];
  const today = new Date();
  const local = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  agent.destroy();
  return {
    c: counter.id,
    d: local(today),
    from14: new Date(today.getTime() - 14 * 86_400_000).toISOString(),
    h: hospital.id,
    k: kitchen.id,
    r: counter.restaurantId ?? counter.restaurant?.id,
  };
}

ids = await resolveIds();
console.log(`ids ${JSON.stringify(ids)}\n${USERS} users, ramp ${RAMP_S}s, hold ${HOLD_S}s`);

const ticker = setInterval(() => {
  const s = stats(windowMs);
  const row = {
    errors: windowErrors,
    p50: s.p50,
    p95: s.p95,
    requests: s.n,
    rps: Math.round(s.n / 10),
    t: Math.round((Date.now() - started) / 1000),
    users: activeUsers,
  };
  timeline.push(row);
  console.log(
    `t=${row.t}s users=${row.users} rps=${row.rps} p50=${row.p50}ms p95=${row.p95}ms errors=${row.errors}`,
  );
  windowMs = [];
  windowErrors = 0;
}, 10_000);

const people = [];
// A run under 1,000 takes users spread over the first 1,000, so every role is in it.
for (let i = 1; i <= USERS; i += 1) {
  people.push(person(USERS >= 1000 ? i : Math.round((i * 1000) / USERS)));
  await sleep((RAMP_S * 1000) / USERS);
}
await Promise.all(people);
clearInterval(ticker);

const endpoints = [...calls]
  .map(([endpoint, e]) => ({ endpoint, ...stats(e.ms), status: e.status }))
  .sort((a, b) => b.p95 - a.p95);
const screensOut = [...screenTimes]
  .map(([screen, ms]) => ({ screen, ...stats(ms) }))
  .sort((a, b) => b.p95 - a.p95);
const all = endpoints.reduce((s, e) => s + e.n, 0);
const failed = [...calls.values()].reduce(
  (s, e) =>
    s +
    Object.entries(e.status)
      .filter(([k]) => k === '0' || Number(k) >= 400)
      .reduce((t, [, v]) => t + v, 0),
  0,
);
const result = {
  endpoints,
  failed,
  ids,
  model: OLD ? 'old' : 'new',
  requests: all,
  screens: screensOut,
  settings: { HOLD_S, RAMP_S, USERS },
  signIns: { ...stats(signIns.ms), status: signIns.status },
  timeline,
};

mkdirSync('scripts/loadtest/results', { recursive: true });
const file = `scripts/loadtest/results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(result, null, 2));
console.log(`\nsign-ins ${JSON.stringify(result.signIns)}`);
console.log(
  `requests ${all}, failed ${failed} (${((failed / Math.max(all, 1)) * 100).toFixed(2)}%)`,
);
console.log('\nslowest screens (what a person waits for):');
console.table(screensOut.slice(0, 12));
console.log('slowest endpoints:');
console.table(endpoints.slice(0, 20).map((e) => ({ ...e, status: JSON.stringify(e.status) })));
console.log(`saved ${file}`);
