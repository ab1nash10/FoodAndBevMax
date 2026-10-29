// The load test against a deployed AAHAR (the AWS dev cluster), where the dev OTP does not work:
// LOADTEST users sign in by email and password instead. Run it yourself, off-peak, with the
// DevOps team told: the cluster and its database are shared with other applications.
//
//   set AAHAR_URL=https://<host>/fandb/api/v1     the deployed API
//   set ADMIN_EMAIL=... & set ADMIN_PASSWORD=...   a Super Admin (signing in here signs that
//                                                  user out of their browser: one browser each)
//   set LOADTEST_LOCATION=<location name>          where the test users and test till work
//   set LOADTEST_INSECURE=1                        only for the ALB's own hostname (no matching
//                                                  certificate); not needed on a real domain
//
//   node scripts/loadtest/aws.mjs setup      1,000 LOADTEST users + a "LOADTEST Till" (≈12 min:
//                                            user creation is capped at 100 a minute per admin)
//   node scripts/loadtest/aws.mjs run        200, then 500, then 1,000 users; stops at the first
//                                            stage that passes 5% errors or a 10 s p95
//   node scripts/loadtest/aws.mjs teardown   sets the users disabled and the till inactive
//
// Writes scripts/loadtest/results/aws-target.json (the password and till key: keep it local) and
// one log per stage; nothing is billed and no SMS or email is sent.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const USERS = 1000;
const RESULTS = 'scripts/loadtest/results';
const TARGET_FILE = `${RESULTS}/aws-target.json`;
const base = (process.env.AAHAR_URL ?? '').replace(/\/+$/, '');
if (process.env.LOADTEST_INSECURE === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const email = (n) => `loadtest-${String(n).padStart(4, '0')}@aahar.test`;
// The same split as seed-users.sql: half cashiers, then inventory, kitchen and admins.
const roleOf = (n) =>
  n <= 500
    ? 'POS Cashier'
    : n <= 750
      ? 'Inventory Manager'
      : n <= 900
        ? 'Kitchen Operator'
        : 'Admin';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function need(name) {
  if (!process.env[name]) {
    console.error(`Set ${name} first (see the top of scripts/loadtest/aws.mjs).`);
    process.exit(1);
  }
  return process.env[name];
}

/** One API call; waits and retries while the server says too many requests. */
async function api(method, path, token, body) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${base}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      method,
    });
    if (res.status === 429 && attempt < 20) {
      await sleep(15_000);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    return { data: json.data, message: json.message, status: res.status };
  }
}

async function signInAdmin() {
  // A Super Admin's access token from their browser (30 min) instead of their password.
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const res = await api('POST', '/auth/login-with-password', null, {
    email: need('ADMIN_EMAIL'),
    password: need('ADMIN_PASSWORD'),
  });
  if (res.status >= 300) throw new Error(`admin sign-in failed (${res.status}): ${res.message}`);
  return res.data.accessToken;
}

async function setup() {
  need('AAHAR_URL');
  const token = await signInAdmin();
  const saved = existsSync(TARGET_FILE) ? JSON.parse(readFileSync(TARGET_FILE, 'utf8')) : null;
  // Kept across runs: an admin cannot change a user's password for 8 h after they were active.
  const password = saved?.password ?? `Lt${randomBytes(9).toString('base64url')}9`;

  // LOADTEST_LOCATION if set; else Max Healthcare, else the first location with a counter and
  // a kitchen, so every role's screens have something to show.
  const hospitals = (await api('GET', '/hospitals?limit=100', token)).data.items.sort(
    (a, b) =>
      Number(b.hospitalName === 'Max Healthcare') - Number(a.hospitalName === 'Max Healthcare'),
  );
  let hospital, counter, kitchen;
  for (const candidate of hospitals) {
    if (process.env.LOADTEST_LOCATION && candidate.hospitalName !== process.env.LOADTEST_LOCATION)
      continue;
    const counters = (await api('GET', `/counters?hospitalId=${candidate.id}&limit=10`, token))
      .data;
    const found = (counters.items ?? counters).find((entry) => entry.isActive !== false);
    const kitchens = (await api('GET', `/kitchens?hospitalId=${candidate.id}&limit=1`, token)).data
      .items;
    if (found && (kitchens[0] || process.env.LOADTEST_LOCATION)) {
      [hospital, counter, kitchen] = [candidate, found, kitchens[0]];
      break;
    }
  }
  if (!hospital)
    throw new Error('no location with a counter and a kitchen (set LOADTEST_LOCATION)');
  const locationName = hospital.hospitalName;
  console.log(`Location: ${locationName}`);
  if (!kitchen) console.warn(`${locationName} has no kitchen: kitchen screens will show errors`);
  const restaurantId = counter.restaurantId ?? counter.restaurant?.id;

  const roles = (await api('GET', '/roles?limit=100', token)).data;
  const roleIds = Object.fromEntries((roles.items ?? roles).map((role) => [role.name, role.id]));
  for (const name of ['POS Cashier', 'Inventory Manager', 'Kitchen Operator', 'Admin']) {
    if (!roleIds[name]) throw new Error(`no role named ${name}`);
  }

  // The test till: its own POS device, so no real till is set up anew (that would sign it out).
  const devices = (await api('GET', `/pos-devices?hospitalId=${hospital.id}&limit=100`, token)).data
    .items;
  let device = devices.find((entry) => entry.code === 'LOADTEST-TILL');
  if (!device) {
    const created = await api('POST', '/pos-devices', token, {
      code: 'LOADTEST-TILL',
      hospitalId: hospital.id,
      isActive: true,
      name: 'LOADTEST Till',
      restaurantIds: [restaurantId],
    });
    if (created.status >= 300) throw new Error(`test till: ${created.message}`);
    device = created.data;
  } else if (!device.isActive) {
    await api('PUT', `/pos-devices/${device.id}`, token, { isActive: true });
  }
  const till = await api('POST', '/pos/till', token, { posDeviceId: device.id });
  if (till.status >= 300) throw new Error(`setting up the test till: ${till.message}`);

  const userIds = saved?.userIds ?? {};
  for (let n = 1; n <= USERS; n += 1) {
    if (userIds[n]) {
      await api('PUT', `/users/${userIds[n]}`, token, { status: 'ACTIVE' });
    } else {
      const res = await api('POST', '/users', token, {
        email: email(n),
        employeeCode: `LOADTEST-${String(n).padStart(4, '0')}`,
        hospitalIds: [hospital.id],
        mobile: String(7000000000 + n),
        name: `Load Test ${n}`,
        password,
        roleId: roleIds[roleOf(n)],
      });
      if (res.status >= 300) throw new Error(`user ${n}: ${res.status} ${res.message}`);
      userIds[n] = res.data.id;
    }
    if (n % 50 === 0) console.log(`${n} users ready`);
    // Saved as it goes, so a stopped setup resumes where it was.
    mkdirSync(RESULTS, { recursive: true });
    writeFileSync(
      TARGET_FILE,
      JSON.stringify({
        base,
        deviceId: device.id,
        ids: { c: counter.id, h: hospital.id, k: kitchen?.id ?? '', r: restaurantId },
        password,
        tillKey: till.data.tillKey,
        userIds,
      }),
    );
  }
  console.log(`Ready: ${USERS} users and the test till at ${locationName}.`);
}

function run() {
  if (!existsSync(TARGET_FILE)) throw new Error('run setup first');
  const stages = [
    { hold: 120, ramp: 60, users: 200 },
    { hold: 180, ramp: 90, users: 500 },
    { hold: 360, ramp: 120, users: 1000 },
  ];
  for (const stage of stages) {
    console.log(`\n=== ${stage.users} users ===`);
    const result = spawnSync(
      process.execPath,
      [
        'scripts/loadtest/run.mjs',
        '--users',
        String(stage.users),
        '--ramp',
        String(stage.ramp),
        '--hold',
        String(stage.hold),
      ],
      { encoding: 'utf8', env: { ...process.env, LOADTEST_TARGET: TARGET_FILE } },
    );
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    writeFileSync(`${RESULTS}/aws-${stage.users}.log`, log);
    console.log(
      log
        .split('\n')
        .filter((line) => /^t=|STOP|requests|sign-ins/.test(line))
        .join('\n'),
    );
    if (result.status !== 0) {
      console.log(
        `Stopped after the ${stage.users}-user stage (see ${RESULTS}/aws-${stage.users}.log).`,
      );
      return;
    }
    // Let sessions and connections settle between stages.
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},60000)']);
  }
  console.log('\nAll stages done. Logs: scripts/loadtest/results/aws-*.log');
}

async function teardown() {
  need('AAHAR_URL');
  const saved = JSON.parse(readFileSync(TARGET_FILE, 'utf8'));
  const token = await signInAdmin();
  for (const [n, id] of Object.entries(saved.userIds)) {
    await api('PUT', `/users/${id}`, token, { status: 'DISABLED' });
    if (Number(n) % 100 === 0) console.log(`${n} users disabled`);
  }
  await api('PUT', `/pos-devices/${saved.deviceId}`, token, { isActive: false });
  console.log('Test users are disabled and the test till is inactive.');
}

const step = process.argv[2];
const steps = { run, setup, teardown };
if (!steps[step]) {
  console.error('Usage: node scripts/loadtest/aws.mjs setup | run | teardown');
  process.exit(1);
}
await steps[step]();
