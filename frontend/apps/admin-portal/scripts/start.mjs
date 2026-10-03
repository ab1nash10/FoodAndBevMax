import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ?? process.env.ADMIN_PORTAL_PORT ?? '3000';

const child = spawn(process.execPath, [nextCli, 'start', '-H', host, '-p', port], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
