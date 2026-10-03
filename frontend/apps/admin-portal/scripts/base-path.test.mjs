// The routing prefix is the one thing that silently breaks every route when it is wrong:
// with the wrong value Next emits root-relative asset URLs and the load balancer 404s them.
// Run with node's type stripping so the check reads the real module, not a copy of it.
import assert from 'node:assert/strict';

const load = async () => {
  const mod = await import(`../lib/base-path.ts?${Math.random()}`);

  return mod;
};

// Default: no env var set, as in an image built without the build arg.
delete process.env.NEXT_PUBLIC_BASE_PATH;
let { BASE_PATH, withBasePath } = await load();
assert.equal(BASE_PATH, '/fandb');
assert.equal(withBasePath('/api/health'), '/fandb/api/health');
assert.equal(withBasePath('api/health'), '/fandb/api/health');

// An empty build arg must not fall back to serving at the root either.
process.env.NEXT_PUBLIC_BASE_PATH = '';
({ BASE_PATH } = await load());
assert.equal(BASE_PATH, '/fandb');

// An override wins, and a trailing slash does not produce a doubled separator.
process.env.NEXT_PUBLIC_BASE_PATH = '/other/';
({ BASE_PATH, withBasePath } = await load());
assert.equal(BASE_PATH, '/other');
assert.equal(withBasePath('/api/health'), '/other/api/health');

console.log('base-path ok');
