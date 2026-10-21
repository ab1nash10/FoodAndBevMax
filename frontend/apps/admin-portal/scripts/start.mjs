import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');

// Unset = every address, IPv6 and IPv4, so localhost does not wait on ::1 first.
const host = process.env.HOST;
const port = process.env.PORT ?? process.env.ADMIN_PORTAL_PORT ?? '3000';

const child = spawn(
  process.execPath,
  [nextCli, 'start', ...(host ? ['-H', host] : []), '-p', port],
  {
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
