import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { HOST_DENIAL_CODES } from './hetzner-release-host-denials.mts';

const require = createRequire(resolve('scripts/ci/hetzner-release-host-denials.test.mts'));
const O: typeof import('./hetzner-release-observe.mjs') = require('./hetzner-release-observe.mts');
test('published host denial codes are unique finite constants', () => {
  assert.equal(new Set(HOST_DENIAL_CODES).size, HOST_DENIAL_CODES.length);
  for (const code of HOST_DENIAL_CODES) assert.match(code, /^[a-z][a-z0-9-]{0,127}$/);
});

test('a host denial is copied into receipts only when it is a listed constant', async () => {
  const lease = 'b'.repeat(32), token = 'TEST_ONLY_NOT_A_CREDENTIAL_0000', sha = 'a'.repeat(40);
  const denied = (reason: string) => async () => ({ code: 1, stdout: Buffer.from(JSON.stringify({ denied: reason })) });
  await assert.rejects(O.githubAuth(denied('disk-space'), sha, '123', lease, token),
    (error: unknown) => error instanceof Error && error.message === 'host-disk-space');
  await assert.rejects(O.githubAuth(denied('synthetic-unlisted-private-value'), sha, '123', lease, token),
    (error: unknown) => error instanceof Error && error.message === 'github-auth-denied');
});
