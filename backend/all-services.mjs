/**
 * Runs all three backend services in one container - the entrypoint of an image built with
 * `--build-arg SERVICE=all`.
 *
 * Exists for pipelines that deploy exactly one backend image per application, like the shared
 * dev-cluster Jenkins. That pipeline shipped a single service as "the backend", so whichever
 * service the image carried answered, and the other two did not exist in the cluster at all:
 * sign-in (auth-service) returned 404 from user-service.
 *
 * One listener on PORT dispatches by path - the same table as the Helm chart's ingress rules,
 * longest prefix first - to the three unchanged services, each running as a child process on a
 * loopback port with its own guards, configuration and logging.
 *
 * Before starting anything it brings the database up to date - `prisma migrate deploy`, then
 * the seed - because those pipelines have no migration step: the first deploy through one
 * found no tables at all, so sign-in failed with "public.users does not exist". Both steps
 * are idempotent and migrate deploy takes an advisory lock, so every restart and every
 * replica may run them. A failure stops the pod before it serves anything, rather than
 * serving against a half-migrated schema. Set DB_SETUP_ON_START=false to skip both.
 *
 * The Helm chart in infra/helm/fandb remains the full deployment: separate images roll and
 * scale per service, and its hooks run the migration and seed instead.
 */
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { availableParallelism } from 'node:os';

const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const apiPrefix = `${basePath}/api/v1`;
// 4000 matches the Dockerfile HEALTHCHECK's own fallback.
const listenPort = Number(process.env.PORT ?? 4000);
// Unset = Node's default: every address, IPv6 and IPv4 (see the services' main.ts).
const listenHost = process.env.HOST || undefined;

// The organization service carries almost all the traffic (menus, bills, stock, lists) and a
// Node process uses one core, so on a pod with more cores it can run as several processes.
// ORG_WORKERS=1 (the default) is one process, as before; "auto" is one per core left over after
// the other two services. Each worker gets an equal share of the connection pool it would
// otherwise have had alone, so more workers do not open more database connections.
const orgWorkers = Math.max(
  1,
  process.env.ORG_WORKERS === 'auto'
    ? availableParallelism() - 2
    : Number.parseInt(process.env.ORG_WORKERS ?? '1', 10) || 1,
);

// Path table from infra/helm/fandb values.yaml `apiPaths`; organization is the catch-all,
// so it also serves ${apiPrefix}/health - like the chart, where the ALB health check does.
const services = [
  {
    name: 'auth-service',
    paths: ['/auth'],
    ports: [42001],
  },
  {
    name: 'user-service',
    paths: ['/users', '/roles', '/permissions', '/notifications'],
    ports: [42002],
  },
  {
    name: 'organization-service',
    paths: [''],
    ports: Array.from({ length: orgWorkers }, (_, index) => 42003 + index * 10),
  },
];
const catchAll = services[services.length - 1];

// Connections to the services are kept open and reused: opening a new one for every request
// cost a connect and a teardown each time.
const agent = new http.Agent({ keepAlive: true, maxSockets: 512 });
let nextWorker = 0;

/** The next process of a service to send a request to, taking turns across its workers. */
function portFor(service) {
  nextWorker = (nextWorker + 1) % 1_000_000;

  return service.ports[nextWorker % service.ports.length];
}

/** DATABASE_URL with this worker's share of the pool, when the service runs as several. */
function databaseUrlFor(workers) {
  const url = process.env.DATABASE_URL;

  if (!url || workers === 1) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const pool =
      Number(parsed.searchParams.get('connection_limit')) || availableParallelism() * 2 + 1;
    parsed.searchParams.set('connection_limit', String(Math.max(2, Math.ceil(pool / workers))));

    return parsed.toString();
  } catch {
    return url;
  }
}

function targetFor(url) {
  const path = url.split('?')[0];

  if (!path.startsWith(apiPrefix)) {
    return catchAll;
  }

  const rest = path.slice(apiPrefix.length);

  for (const service of services) {
    if (service.paths.some((p) => p && (rest === p || rest.startsWith(`${p}/`)))) {
      return service;
    }
  }

  return catchAll;
}

const server = http.createServer((request, response) => {
  const path = (request.url ?? '').split('?')[0];

  // Liveness at the root, answered here like each service's own bootstrap does: a default
  // load-balancer target group health-checks `/`.
  if (path === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ service: 'backend-all', status: 'ok' }));
    return;
  }

  const service = targetFor(request.url ?? '');
  const upstream = http.request(
    {
      agent,
      headers: request.headers,
      host: '127.0.0.1',
      method: request.method,
      path: request.url,
      port: portFor(service),
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
    }
    response.end(
      JSON.stringify({ message: 'The service is starting. Please retry.', success: false }),
    );
  });
  request.on('error', () => upstream.destroy());
  request.pipe(upstream);
});

let shuttingDown = false;
const children = [];

/** Stops the children, waits for them to drain, then exits; Kubernetes restarts the pod. */
function shutdown(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  server.close();
  const alive = children.filter((child) => child.exitCode === null && child.signalCode === null);

  if (alive.length === 0) {
    process.exit(code);
  }

  let remaining = alive.length;
  for (const child of alive) {
    child.once('exit', () => {
      remaining -= 1;
      if (remaining === 0) {
        process.exit(code);
      }
    });
    child.kill('SIGTERM');
  }

  // A child that will not drain must not keep the pod alive forever.
  setTimeout(() => process.exit(code), 10_000).unref();
}

/** Runs one setup step to completion; a failed step fails the pod. */
function runSetupStep(label, args) {
  console.info(JSON.stringify({ event: 'db_setup_started', step: label }));
  const result = spawnSync(process.execPath, args, { env: process.env, stdio: 'inherit' });

  if (result.status !== 0) {
    console.error(JSON.stringify({ event: 'db_setup_failed', status: result.status, step: label }));
    process.exit(1);
  }

  console.info(JSON.stringify({ event: 'db_setup_done', step: label }));
}

if (process.env.DB_SETUP_ON_START !== 'false') {
  runSetupStep('migrate', [
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
    '--schema',
    'prisma/schema.prisma',
  ]);
  // The seed gives the Super Admin its first password from ADMIN_PASSWORD, only while the
  // account has none; without it the account exists and `set-admin-password` sets one.
  runSetupStep('seed', ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts']);
}

for (const service of services) {
  for (const port of service.ports) {
    const child = spawn(
      process.execPath,
      ['--enable-source-maps', `backend/services/${service.name}/dist/main.js`],
      {
        // Loopback only: the router is the single exposed listener.
        env: {
          ...process.env,
          DATABASE_URL: databaseUrlFor(service.ports.length),
          HOST: '127.0.0.1',
          PORT: String(port),
        },
        stdio: 'inherit',
      },
    );

    child.on('exit', (code, signal) => {
      if (shuttingDown) {
        return;
      }
      // One dead service means sign-in or data silently gone; fail the whole pod instead.
      console.error(
        JSON.stringify({ code, event: 'service_exited', port, service: service.name, signal }),
      );
      shutdown(1);
    });

    children.push(child);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

server.listen(listenPort, listenHost, () => {
  console.info(
    JSON.stringify({
      apiPrefix,
      event: 'backend_all_listening',
      port: listenPort,
      orgWorkers,
      services: services.map(({ name }) => name),
    }),
  );
});
