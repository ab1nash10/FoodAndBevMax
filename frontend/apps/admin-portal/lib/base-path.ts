/**
 * The routing prefix the platform is served under.
 *
 * `/fandb` is the default rather than a required build arg: the prefix is hard-coded in the
 * ingress paths, both readiness probes and both Dockerfile health checks, so an image built
 * without it is never useful - it just 404s every route. Override only to serve elsewhere.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '/fandb').replace(/\/+$/, '');

/**
 * Next applies `basePath` to the router and `<Link>`, but not to anything that resolves
 * against the origin itself. Two cases need this helper:
 *
 * - a raw `fetch('/api/...')`, which would miss the prefix entirely;
 * - the `src` of `next/image`, which is passed through to the optimizer verbatim. Under a
 *   prefix the file lives at `/fandb/brand/logo.png`, so an unprefixed `src` makes the
 *   optimizer fetch a path that does not exist and answer 400 - and an SVG, which Next
 *   serves unoptimized, simply 404s in the browser.
 *
 * Absolute URLs are returned untouched, so a stored image URL on another host still works.
 */
export function withBasePath(path: string): string {
  if (path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return path;
  }

  const suffix = path.startsWith('/') ? path : `/${path}`;

  return `${BASE_PATH}${suffix}`;
}
