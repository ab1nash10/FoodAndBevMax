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
 * The Helm chart in infra/helm/fandb remains the full deployment: separate images roll and
 * scale per service, and its hooks run the migration and seed. This mode trades that away to
 * fit a one-image pipeline, and migrations must be run separately (the migrate image).
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const apiPrefix = `${basePath}/api/v1`;
// 4000 matches the Dockerfile HEALTHCHECK's own fallback.
const listenPort = Number(process.env.PORT ?? 4000);
const listenHost = process.env.HOST ?? '0.0.0.0';

// Path table from infra/helm/fandb values.yaml `apiPaths`; organization is the catch-all,
// so it also serves ${apiPrefix}/health - like the chart, where the ALB health check does.
const services = [
  {
    name: 'auth-service',
    paths: ['/auth'],
    port: 42001,
  },
  {
    name: 'user-service',
    paths: ['/users', '/roles', '/permissions', '/notifications'],
    port: 42002,
  },
  {
    name: 'organization-service',
    paths: [''],
    port: 42003,
  },
];
const catchAll = services[services.length - 1];

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
      headers: request.headers,
      host: '127.0.0.1',
      method: request.method,
      path: request.url,
      port: service.port,
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

for (const service of services) {
  const child = spawn(
    process.execPath,
    ['--enable-source-maps', `backend/services/${service.name}/dist/main.js`],
    {
      // Loopback only: the router is the single exposed listener.
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(service.port) },
      stdio: 'inherit',
    },
  );

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    // One dead service means sign-in or data silently gone; fail the whole pod instead.
    console.error(JSON.stringify({ code, event: 'service_exited', service: service.name, signal }));
    shutdown(1);
  });

  children.push(child);
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
      services: services.map(({ name }) => name),
    }),
  );
});
