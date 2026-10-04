import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { command, sshTransport } from './hetzner-release-client.mjs';
import type { RunnerConfig, Transport } from './hetzner-release-client.mjs';
const T: typeof import('./hetzner-observer-token.mts') =
  createRequire(resolve('scripts/ci/hetzner-observer-token.test.mts'))('./hetzner-observer-token.mts');
const token = Buffer.from('TEST_ONLY_OPAQUE_JOB_TOKEN_000000');
const config: RunnerConfig = { host: 'test-only.invalid', port: 2222, user: 'sm-release',
  private_key: '/trusted/test-only-key', known_hosts: '/trusted/test-only-hosts' };

// Red if the credential is appended to argv/env, sent without EOF, or SSH
// pinning differs from ordinary host calls. Exercise a real child and pipes.
test('job token uses fixed pinned SSH grammar and stdin EOF without output exposure', async () => {
  let calls = 0;
  const transport = sshTransport(config, (program, args, options) => {
    calls++;
    assert.equal(program, '/usr/bin/ssh');
    assert.equal(options.shell, false);
    assert.equal(args.at(-1), 'observer-token');
    assert.equal(args.at(-2), config.host);
    assert.ok(args.includes(`UserKnownHostsFile=${config.known_hosts}`));
    assert.ok(args.includes(config.private_key));
    assert.equal(JSON.stringify([args, options]).includes(token.toString()), false);
    return spawn(process.execPath, ['--experimental-strip-types',
      resolve('scripts/ci/hetzner-observer-token-fixture.mts'), ...args], options);
  });
  await T.configureObserverToken(transport, token);
  assert.equal(calls, 1);
  assert.throws(() => command('observer-token', [token.toString()]));
  assert.throws(() => command('observer-token /tmp/token'));
});

// Red if invalid token bytes reach SSH, or remote token-bearing output/errors
// are reused as a receipt or error instead of a finite configured/denied result.
test('invalid inputs and secret-bearing host output fail with finite errors', async () => {
  const unused: Transport = async () => { throw new Error('must not reach SSH'); };
  for (const bytes of [Buffer.alloc(0), Buffer.from('TEST_SHORT'), Buffer.alloc(4097, 65),
    Buffer.from(token.toString() + '\n'), Buffer.alloc(20, 255)]) {
    await assert.rejects(T.configureObserverToken(unused, bytes), /^Error: observer-token-denied$/u);
  }
  for (const code of [0, 1, 255]) {
    const transport: Transport = async () => ({ code, stdout: token });
    await assert.rejects(T.configureObserverToken(transport, token), /^Error: observer-token-denied$/u);
  }
  const hostile: Transport = async () => { throw new Error(token.toString()); };
  await assert.rejects(T.configureObserverToken(hostile, token), /^Error: observer-token-denied$/u);
});
