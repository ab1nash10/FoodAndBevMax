// Everyone at once: N users (seed-users.sql, dev OTP) do the same thing at the same instant, to find
// races, lock queues and rate-limit mistakes that a steady load never hits.
//
//   LOADTEST_BASE=http://<api>/api/v1 node scripts/loadtest/writes.mjs [--users 3000] [--counters 50]
//
// Local throwaway database only (aahar_load): it adds counters to the test till, opens shifts,
// saves bills and creates items. Each step fires every request together and reports status codes
// and latency; the exit code is 1 when a step breaks its rule (a 5xx, a duplicate, a lost bill).
import http from 'node:http';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const USERS = arg('users', 3000);
const COUNTERS = arg('counters', 50);
const BASE = process.env.LOADTEST_BASE ?? 'http://localhost:4100/api/v1';
const LOCATION = 'Max-Smart';
const TILL_DEVICE = process.env.LOADTEST_TILL_DEVICE ?? 'Smart Main Res';
const RUN = Date.now().toString(36);
let tillKey = '';

function request(agent, method, path, token, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const url = new URL(BASE + path);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const req = http.request(
      url,
      {
        agent,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(tillKey && path.startsWith('/pos/') ? { 'x-till-key': tillKey } : {}),
          ...(payload
            ? { 'content-length': Buffer.byteLength(payload), 'content-type': 'application/json' }
            : {}),
        },
        method,
        timeout: 60_000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            // Not JSON (a proxy's error page): the status says enough.
          }
          resolve({ json, ms: performance.now() - t0, status: res.statusCode, text });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ error: e.message, ms: performance.now() - t0, status: 0 }));
    req.end(payload);
  });
}

const failures = [];
function report(step, results, rule) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] ?? 0);
  const status = {};
  for (const r of results) status[r.status] = (status[r.status] ?? 0) + 1;
  const broken = rule(status, results);
  console.log(
    `${broken ? 'FAIL' : 'ok  '} ${step}: n=${results.length} p50=${q(0.5)} p95=${q(0.95)} max=${q(1)} ms status=${JSON.stringify(status)}${broken ? ` -> ${broken}` : ''}`,
  );
  const odd = results.find((r) => r.status >= 500 || r.status === 0);
  if (odd)
    console.log(`     first error: ${odd.status} ${(odd.error ?? odd.text ?? '').slice(0, 200)}`);
  if (broken) failures.push(`${step}: ${broken}`);
}
const no5xx = (status) =>
  Object.keys(status).some((s) => s === '0' || Number(s) >= 500)
    ? 'server errors or dropped connections'
    : '';
/** Every one of `fn` released at the same instant. */
async function together(list, fn) {
  const at = Date.now() + 300;
  return Promise.all(
    list.map(async (x, i) => {
      await new Promise((r) => setTimeout(r, at - Date.now()));
      return fn(x, i);
    }),
  );
}

const roleOf = (n) => {
  const k = ((n - 1) % 1000) + 1;
  return k <= 500 ? 'cashier' : k <= 750 ? 'inventory' : k <= 900 ? 'kitchen' : 'admin';
};
const users = Array.from({ length: USERS }, (_, i) => ({
  agent: new http.Agent({ keepAlive: true, maxSockets: 6 }),
  n: i + 1,
  role: roleOf(i + 1),
}));

// ---- Setup, as the Super Admin: the till, and COUNTERS counters it bills on.
const setupAgent = new http.Agent({ keepAlive: true });
const admin = await request(setupAgent, 'POST', '/auth/verify-otp', null, {
  mobile: '9999999991',
  otp: '000000',
});
if (admin.status >= 300) throw new Error(`admin sign-in ${admin.status} ${admin.text}`);
const adminToken = admin.json.data.accessToken;
const get = async (path) => (await request(setupAgent, 'GET', path, adminToken)).json.data;
const hospital = (await get('/hospitals?limit=100')).items.find((h) => h.hospitalName === LOCATION);
const device = (await get('/pos-devices?limit=100')).items.find((d) => d.name === TILL_DEVICE);
if (!hospital || !device) throw new Error('no Max-Smart location or test till');
const enrolled = await request(setupAgent, 'POST', '/pos/till', adminToken, {
  computerName: device.hostName ?? '',
  posDeviceId: device.id,
});
tillKey = enrolled.json?.data?.tillKey;
if (!tillKey) throw new Error(`till ${enrolled.status} ${enrolled.text}`);
const restaurantId =
  (device.restaurants?.[0]?.restaurantId ?? device.restaurants?.[0]?.restaurant?.id) ||
  (await get(`/counters?hospitalId=${hospital.id}&limit=100`)).items.find(
    (c) => c.posDeviceId === device.id,
  )?.restaurantId;
if (!restaurantId) throw new Error('the test till has no restaurant');
const existing = (await get(`/counters?hospitalId=${hospital.id}&limit=100`)).items.filter((c) =>
  c.counterCode?.startsWith('LT-'),
);
for (let i = existing.length + 1; i <= COUNTERS; i++) {
  const made = await request(setupAgent, 'POST', '/counters', adminToken, {
    counterCode: `LT-${String(i).padStart(2, '0')}`,
    counterName: `Load Test ${i}`,
    hospitalId: hospital.id,
    posDeviceId: device.id,
    restaurantId,
  });
  if (made.status >= 300) throw new Error(`counter ${i}: ${made.status} ${made.text}`);
}
const counters = (await get(`/counters?hospitalId=${hospital.id}&limit=100`)).items
  .filter((c) => c.counterCode?.startsWith('LT-'))
  .slice(0, COUNTERS);
const menuRes = await request(
  setupAgent,
  'GET',
  `/pos/menu?channel=COUNTER&counterId=${counters[0].id}`,
  adminToken,
);
if (menuRes.status >= 300) throw new Error(`menu ${menuRes.status} ${menuRes.text}`);
const menu = menuRes.json?.data?.items;
const sameItem = menu?.find((m) => m.price > 0);
if (!sameItem) throw new Error('the test restaurant sells nothing at the counter');
console.log(
  `run ${RUN}: ${USERS} users, ${counters.length} counters, everyone bills "${sameItem.itemName}"`,
);

// ---- 1. Everyone signs in in the same instant (one address, as a hospital's NAT).
const signIns = await together(users, (u) =>
  request(u.agent, 'POST', '/auth/verify-otp', null, {
    mobile: String(7000000000 + u.n),
    otp: '000000',
  }),
);
signIns.forEach((r, i) => (users[i].token = r.json?.data?.accessToken));
report('sign in, all at once', signIns, (s) => {
  const ok = (s[200] ?? 0) + (s[201] ?? 0);
  return no5xx(s) || (ok < USERS ? `${USERS - ok} could not sign in` : '');
});
const signedIn = users.filter((u) => u.token);
const cashiers = signedIn.filter((u) => u.role === 'cashier');
cashiers.forEach((u, i) => (u.counter = counters[i % counters.length]));

// ---- 2. Every cashier opens a shift on their counter at once: exactly one wins per counter.
const shifts = await together(cashiers, (u) =>
  request(u.agent, 'POST', '/pos/shifts', u.token, { counterId: u.counter.id, openingCash: 0 }),
);
report('open shifts, ~30 cashiers per counter', shifts, (s) => {
  const opened = (s[200] ?? 0) + (s[201] ?? 0);
  return (
    no5xx(s) ||
    (opened > counters.length ? `${opened} shifts opened on ${counters.length} counters` : '')
  );
});

// ---- 3. Every cashier bills the same item at the same instant, paid in cash.
const billOf = (u) => ({
  channel: 'COUNTER',
  clientOrderId: `lt-${RUN}-${u.n}`,
  counterId: u.counter.id,
  lines: [{ menuId: sameItem.id, quantity: 1 }],
  paymentMode: 'CASH',
});
const bills = await together(cashiers, (u) =>
  request(u.agent, 'POST', '/pos/orders', u.token, billOf(u)),
);
report(
  'bill the same item, all at once',
  bills,
  (s) =>
    no5xx(s) ||
    ((s[200] ?? 0) + (s[201] ?? 0) < cashiers.length ? 'some bills were not saved' : ''),
);

// ---- 4. The same bill sent twice at once (a double click, a retry): one bill.
const pairs = cashiers.slice(0, 300);
const twice = await together(pairs, async (u) => {
  const body = { ...billOf(u), clientOrderId: `lt-${RUN}-twice-${u.n}` };
  const [a, b] = await Promise.all([
    request(u.agent, 'POST', '/pos/orders', u.token, body),
    request(u.agent, 'POST', '/pos/orders', u.token, body),
  ]);
  return {
    ...a,
    ms: Math.max(a.ms, b.ms),
    same: a.json?.data?.id && a.json?.data?.id === b.json?.data?.id,
    b,
  };
});
report(
  'the same bill twice at once',
  twice,
  (s, rs) =>
    no5xx(s) ||
    (rs.some((r) => !r.same)
      ? `${rs.filter((r) => !r.same).length} pairs did not return one bill`
      : ''),
);

// ---- 5. The same item created 50 times at once (the catalogue is the Super Admin's: location
// admins may not add items): one is created, the rest told it exists.
const items = await together(Array.from({ length: 50 }), () =>
  request(setupAgent, 'POST', '/items', adminToken, {
    itemName: `LT Same Item ${RUN}`,
    type: 'VEG',
  }),
);
report('create the same item 50 times at once', items, (s) => {
  const made = (s[200] ?? 0) + (s[201] ?? 0);
  return no5xx(s) || (made !== 1 ? `${made} items created` : '');
});

// ---- 6. Everyone opens their busiest screen at once (reads, while the till writes above end).
const screenOf = {
  admin: [`/dashboard/nav-counts?hospitalId=${hospital.id}`, '/users/me/access'],
  cashier: ['/pos/counters', `/pos/menu?channel=COUNTER&counterId=${counters[0].id}`],
  inventory: [
    `/transfers?hospitalId=${hospital.id}&limit=20`,
    `/grns?hospitalId=${hospital.id}&limit=20`,
  ],
  kitchen: [`/kitchen-productions?hospitalId=${hospital.id}&limit=20`, '/users/me/access'],
};
const reads = (
  await together(signedIn, (u) =>
    Promise.all(screenOf[u.role].map((path) => request(u.agent, 'GET', path, u.token))),
  )
).flat();
report(
  'everyone opens a screen at once',
  reads,
  (s) => no5xx(s) || (s[429] ? `${s[429]} rate-limited` : ''),
);

// ---- 7. Rate limiting: one user floods; they are stopped, and nobody else is.
const flooder = signedIn.find((u) => u.role === 'admin') ?? signedIn[0];
const bystanders = signedIn.filter((u) => u !== flooder).slice(0, 200);
const [flood, others] = await Promise.all([
  together(Array.from({ length: 150 }), () =>
    request(flooder.agent, 'GET', '/users/me/access', flooder.token),
  ),
  together(bystanders, (u) => request(u.agent, 'GET', '/users/me/access', u.token)),
]);
report(
  'one user sends 150 requests at once',
  flood,
  (s) => no5xx(s) || (!s[429] ? 'never rate-limited' : ''),
);
report(
  '...while 200 others work',
  others,
  (s) => no5xx(s) || (s[429] ? `${s[429]} bystanders rate-limited` : ''),
);

// ---- Bills on record: every saved bill once, numbers unique (also checked in SQL afterwards).
const ids = new Set(bills.map((r) => r.json?.data?.id).filter(Boolean));
const numbers = bills.map((r) => r.json?.data?.billNumber).filter(Boolean);
if (new Set(numbers).size !== numbers.length) failures.push('duplicate bill numbers in responses');
console.log(
  `bills saved ${ids.size}, unique numbers ${new Set(numbers).size} of ${numbers.length}`,
);

// Leave the counters able to start again: end the shifts that opened.
await Promise.all(
  shifts.map((r, i) =>
    r.json?.data?.id
      ? request(
          cashiers[i].agent,
          'PATCH',
          `/pos/shifts/${r.json.data.id}/end`,
          cashiers[i].token,
          {
            countedCash: 0,
            handover: false,
          },
        )
      : null,
  ),
);

console.log(
  failures.length
    ? `\n${failures.length} FAILED:\n- ${failures.join('\n- ')}`
    : '\nall steps passed',
);
process.exit(failures.length ? 1 : 0);
