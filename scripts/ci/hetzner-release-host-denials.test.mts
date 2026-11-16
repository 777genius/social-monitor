import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { HOST_DENIAL_CODES } from './hetzner-release-host-denials.mts';

const require = createRequire(resolve('scripts/ci/hetzner-release-host-denials.test.mts'));
const O: typeof import('./hetzner-release-observe.mjs') = require('./hetzner-release-observe.mts');
const HOST_DIR = 'ops/release/hetzner';
// Same constant-reason shapes the host emits: require(cond, 'reason') and Denied('reason').
const REQUIRE_REASON = /require\((?:[^()]|\([^()]*\))*?,\s*'([a-z][a-z0-9-]{0,127})'\s*\)/gs;
const DENIED_REASON = /Denied\('([a-z][a-z0-9-]{0,127})'\)/g;
const HOST_MODULES = ['archive.py', 'backend_controller.py', 'backend_host.py', 'cohort_compose.py',
  'cohort_controller.py', 'cohort_host.py', 'contract.py', 'evidence.py'];

test('published host denial codes are unique finite constants', () => {
  assert.equal(new Set(HOST_DENIAL_CODES).size, HOST_DENIAL_CODES.length);
  for (const code of HOST_DENIAL_CODES) assert.match(code, /^[a-z][a-z0-9-]{0,127}$/);
});

test('every constant host reason is publishable so a denied admission names its first failed check', () => {
  const published = new Set(HOST_DENIAL_CODES);
  const missing = new Set<string>();
  for (const name of HOST_MODULES) {
    const source = readFileSync(join(HOST_DIR, name), 'utf8');
    for (const pattern of [REQUIRE_REASON, DENIED_REASON])
      for (const match of source.matchAll(pattern)) if (!published.has(match[1])) missing.add(match[1]);
  }
  assert.deepEqual([...missing].sort(), []);
  assert.ok(readdirSync(HOST_DIR).includes('cohort_controller.py'));
});

test('a host denial is copied into receipts only when it is a listed constant', async () => {
  const lease = 'b'.repeat(32), token = 'TEST_ONLY_NOT_A_CREDENTIAL_0000', sha = 'a'.repeat(40);
  const denied = (reason: string) => async () => ({ code: 1, stdout: Buffer.from(JSON.stringify({ denied: reason })) });
  await assert.rejects(O.githubAuth(denied('disk-space'), sha, '123', lease, token),
    (error: unknown) => error instanceof Error && error.message === 'host-disk-space');
  await assert.rejects(O.githubAuth(denied('synthetic-unlisted-private-value'), sha, '123', lease, token),
    (error: unknown) => error instanceof Error && error.message === 'github-auth-denied');
});
