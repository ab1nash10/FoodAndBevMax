// npm run phone: the app on an Android phone over USB, against the dev stack on this PC.
// adb reverse makes the phone's localhost:8081 (Metro), :4001 (sign-in) and :4003 (orders) this
// PC's, so it works on any network. Then Expo starts and opens the app on the phone (installing
// Expo Go there if it is missing).
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');

if (!fs.existsSync(adb)) {
  console.error(`adb not found at ${adb}. Install Android platform-tools there (see README).`);
  process.exit(1);
}

const run = (...args) => execFileSync(adb, args, { encoding: 'utf8' });
const phones = run('devices')
  .split('\n')
  .slice(1)
  .map((line) => line.trim().split(/\s+/))
  .filter(([serial]) => serial);

if (!phones.length) {
  console.error(
    [
      'No phone found. On the phone:',
      '  1. Settings > About phone: tap "Build number" 7 times (Developer options).',
      '  2. Settings > Developer options: turn on "USB debugging".',
      '  3. Plug it into this PC with a data cable and tap Allow on "Allow USB debugging?".',
      'Then run npm run phone again.',
    ].join('\n'),
  );
  process.exit(1);
}
const unauthorised = phones.find(([, state]) => state === 'unauthorized');
if (unauthorised) {
  console.error(
    'The phone is asking "Allow USB debugging?": tap Allow, then run npm run phone again.',
  );
  process.exit(1);
}

const link = () => {
  for (const port of [8081, 4001, 4003]) run('reverse', `tcp:${port}`, `tcp:${port}`);
};
link();
console.log(`Phone ${phones[0][0]}: localhost 8081, 4001 and 4003 now reach this PC.`);
// The links drop whenever the phone reconnects (a replug, Expo installing Expo Go): set them
// again every few seconds, so the app never loses this PC ("site can't be reached").
setInterval(() => {
  try {
    link();
  } catch {
    // Unplugged for now: linked again once it is back.
  }
}, 5_000).unref();

const expo = spawn('npx', ['expo', 'start', '--localhost', '--android'], {
  env: { ...process.env, ANDROID_HOME: sdk },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
expo.on('exit', (code) => process.exit(code ?? 0));
