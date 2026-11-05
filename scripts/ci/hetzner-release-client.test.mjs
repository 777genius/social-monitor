import { setImmediate } from 'node:timers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ClientError, deliver, command, sshArgs, sshTransport, runnerConfig,
  validateManifest, receipt } from './hetzner-release-client.mjs';

const sha = 'a'.repeat(40), run = '123', image = 'sha256:' + 'b'.repeat(64);
const previous = 'sha256:' + 'c'.repeat(64), snapshot = 'sha256:' + 'd'.repeat(64);
const bytes = Buffer.from([0, 255, 10, 13, 65, 0, 99]);
const manifest = { sha, ci_run_id: run,
  image_id: image, archive_sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
  archive_bytes: bytes.length, migrations: [{ name: '20261001000000_initial',
    checksum: createHash('sha256').update('SELECT 1;').digest('hex') }],
  image_graph: { kind: 'oci-manifest' } };
const admission = { ...manifest, previous_image_id: previous, previous_sha: 'e'.repeat(40),
  snapshot_before_hash: snapshot, migration_status: 'unchanged', image_graph: { kind: 'oci-manifest' },
  compatibility: { independent_review: true }, backup: { reference: 'synthetic-full' },
  compose_hash: snapshot, database_hash: snapshot, snapshot_before: { synthetic: true } };
const terminal = { sha, ci_run_id: run, image_id: image, archive_sha256: manifest.archive_sha256,
  previous_image_id: previous, previous_sha: 'e'.repeat(40), snapshot_before_hash: snapshot,
  migration_status: 'unchanged', image_graph: admission.image_graph, compatibility: admission.compatibility,
  backup: admission.backup, schema: 'social-monitor-release-receipt-v1', outcome: 'activated',
  scope: ['api'], snapshot_after_hash: snapshot, probes: { target: true },
  timings: { started_at: 1, finished_at: 2, started_at_ns: 1000 } };
const config = { host: 'synthetic.invalid', port: 2222, user: 'sm-release',
  private_key: '/trusted/key', known_hosts: '/trusted/hosts' };
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort()
    .map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const response = (v, code = 0) => ({ code, stdout: Buffer.from(canonical(v) + '\n') });
async function fixture(body) {
  const dir = await mkdtemp(join(tmpdir(), 'sm-ssh-client-'));
  const options = { manifest: join(dir, 'manifest.json'), archive: join(dir, 'image.tar'),
    phases: join(dir, 'phases.jsonl'), sha, run };
  await writeFile(options.manifest, JSON.stringify(manifest));
  await writeFile(options.archive, bytes);
  try { await body(options); } finally { await rm(dir, { recursive: true, force: true }); }
}
function host(override = () => undefined) {
  const calls = [], uploaded = [];
  let active = false;
  const transport = async (wire, source) => {
    calls.push(wire);
    if (source) for await (const chunk of source()) uploaded.push(chunk);
    const verb = wire.split(' ')[0];
    const custom = await override(verb, wire);
    if (custom !== undefined) return custom;
    if (verb === 'status') return response({ environment: 'production-hetzner', latch: false });
    if (verb === 'preflight') return response({ environment: 'production-hetzner', latch: false,
      machine_id: 'b28fc7b17042414386eb9b114046e50c', snapshot,
      api_image: active ? image : previous, compose: snapshot });
    if (verb === 'receive') return response(manifest);
    if (verb === 'admit') return response(admission);
    if (verb === 'activate') { active = true; return response(terminal); }
    if (verb === 'verify') { active = true; return response({ verified: true, image_id: image, snapshot }); }
    if (verb === 'receipt') return response(terminal);
    throw Error('Unexpected synthetic verb');
  };
  return { transport, calls, uploaded };
}

test('fixed eight-verb grammar rejects options, whitespace, shell syntax and bad bindings', () => {
  assert.equal(command('receive', [sha, run, manifest.archive_sha256, image, '7']),
    `receive ${sha} 123 ${manifest.archive_sha256} ${image} 7`);
  assert.equal(command('rollback', [sha, run]), `rollback ${sha} 123`);
  assert.equal(command('receipt', [`${sha}-123-rollback`]), `receipt ${sha}-123-rollback`);
  for (const [verb, args] of [['status;', []], ['status', ['x']], ['activate', [sha, '01']],
    ['admit', [sha + '\n', run]], ['receive', [sha, run, image, image, '0']],
    ['receipt', [`${sha}-123;id`]], ['toString', []]]) assert.throws(() => command(verb, args));
  for (const mutation of [{ host: 'candidate.invalid' }, { sha: 'f'.repeat(40) },
    { ci_run_id: 123 }, { archive_bytes: 0 }, { image_id: 'latest' }, { schema: 'v2' }])
    assert.throws(() => validateManifest({ ...manifest, ...mutation }, sha, run));
});

test('process seam proves exact SSH arguments, cleared environment, stdin EOF, stderr discard', async () => {
  assert.deepEqual(sshArgs(config, 'status'), ['-F', '/dev/null', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'UserKnownHostsFile=/trusted/hosts', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10', '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'ClearAllForwardings=yes',
    '-o', 'RequestTTY=no', '-o', 'IdentityAgent=none', '-p', '2222', '-l', 'sm-release',
    '-i', '/trusted/key', '--', 'synthetic.invalid', 'status']);
  let observed;
  const received = [];
  const spawnSeam = (file, args, opts) => {
    observed = { file, args, opts };
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { throw Error('Unexpected kill'); };
    child.stdin.on('data', b => received.push(b));
    child.stdin.on('end', () => {
      child.stderr.end('SYNTHETIC_PRIVATE_PAYLOAD');
      child.stdout.end('{"environment":"production-hetzner","latch":false}\n');
      setImmediate(() => child.emit('close', 0));
    });
    return child;
  };
  await sshTransport(config, spawnSeam)('receive ' + [sha, run, image, image, '7'].join(' '),
    async function* () { yield bytes.subarray(0, 3); yield bytes.subarray(3); });
  assert.equal(observed.file, '/usr/bin/ssh'); assert.equal(observed.opts.shell, false);
  assert.deepEqual(observed.opts.env, { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C' });
  assert.deepEqual(Buffer.concat(received), bytes);
});

test('hash before any SSH, exact archive bytes and durable observed phases', async () => fixture(async options => {
  const h = host();
  assert.deepEqual(await deliver(options, h.transport), { phase: 'completed' });
  assert.deepEqual(Buffer.concat(h.uploaded), bytes);
  assert.deepEqual(h.calls.slice(0, 6), ['status', 'preflight',
    `receive ${sha} 123 ${manifest.archive_sha256} ${image} 7`, `admit ${sha} 123`,
    `activate ${sha} 123`, `verify ${sha} 123`]);
  const lines = (await readFile(options.phases, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map(x => x.phase), ['validated', 'preflight-observed', 'received',
    'admitted', 'activation-observed', 'verified', 'completed']);
  assert.ok(lines.every(x => x.sha === sha && x.ci_run_id === run && x.image_id === image));
  await rm(options.phases);
  await writeFile(options.archive, Buffer.from('changed'));
  h.calls.length = 0;
  await assert.rejects(deliver(options, h.transport), /archive-hash/);
  assert.deepEqual(h.calls, []);
}));

test('terminal receipts must prove every binding, admission, target and state', () => {
  for (const mutation of [{ sha: 'f'.repeat(40) }, { ci_run_id: '124' }, { image_id: previous },
    { archive_sha256: previous }, { outcome: 'rolled-back' }, { probes: { target: false } },
    { scope: ['api', 'worker'] }, { snapshot_after_hash: previous }, { image_graph: {} },
    { compatibility: {} }, { migration_status: 'changed' }, { previous_sha: sha },
    { timings: { started_at: 2, finished_at: 1 } }])
    assert.throws(() => receipt({ ...terminal, ...mutation }, manifest, admission));
});

test('lost activation reconciles exact receipt without a second destructive write', async () => fixture(async options => {
  const h = host(verb => { if (verb === 'activate') throw new ClientError('transport-uncertain'); });
  await deliver(options, h.transport);
  assert.equal(h.calls.filter(x => x.startsWith('activate ')).length, 1);
  assert.equal(h.calls.filter(x => x.startsWith('receive ')).length, 1);
  assert.equal(h.calls.filter(x => x.startsWith('rollback ')).length, 0);
  assert.deepEqual(h.calls.slice(5, 8), ['status', 'preflight', `receipt ${sha}-123`]);
  const phases = await readFile(options.phases, 'utf8');
  assert.match(phases, /activation-uncertain/);
}));

test('unproven activation/receive, latch, machine drift and malformed response fail closed', async () => {
  for (const override of [
    verb => { if (verb === 'activate') throw new ClientError('transport-uncertain');
      if (verb === 'receipt') return response({ denied: 'invalid-host-state' }, 1); },
    verb => { if (verb === 'receive') throw new ClientError('transport-uncertain'); },
    verb => verb === 'status' ? response({ latch: true, environment: 'production-hetzner' }) : undefined,
    verb => verb === 'preflight' ? response({ machine_id: 'synthetic-other-host' }) : undefined,
    verb => verb === 'admit' ? { code: 0, stdout: Buffer.from('{bad PRIVATE_PAYLOAD') } : undefined,
    verb => verb === 'activate' ? response({ ...terminal, image_id: previous }) : undefined,
  ]) await fixture(async options => {
    const h = host(override); await assert.rejects(deliver(options, h.transport));
    for (const verb of ['receive', 'activate', 'admit'])
      assert.ok(h.calls.filter(x => x.startsWith(verb + ' ')).length <= 1);
    assert.equal(h.calls.filter(x => x.startsWith('rollback ')).length, 0);
    assert.doesNotMatch(await readFile(options.phases, 'utf8'), /PRIVATE_PAYLOAD|completed/);
  });
});

test('only actual root stale-main reason skips; bounded read-only retry', async () => {
  await fixture(async options => {
    const h = host(verb => verb === 'admit' ? response({ denied: 'stale-main-skip' }, 1) : undefined);
    assert.deepEqual(await deliver(options, h.transport), { phase: 'stale-main-skipped' });
    assert.equal(h.calls.some(x => x.startsWith('activate ')), false);
  });
  await fixture(async options => {
    let n = 0;
    const h = host(verb => { if (verb === 'status' && n++ < 3) throw new ClientError('transport-uncertain'); });
    await assert.rejects(deliver(options, h.transport));
    assert.deepEqual(h.calls, ['status', 'status', 'status']);
  });
});

test('bounded regular files, duplicate manifest keys and candidate transport fields deny before SSH', async () => {
  for (const change of [async o => { await rm(o.archive); await symlink(o.manifest, o.archive); },
    async o => writeFile(o.manifest, '{"sha":"x",' + JSON.stringify(manifest).slice(1)),
    async o => writeFile(o.manifest, JSON.stringify({ ...manifest, host: 'candidate.invalid' })),
    async o => writeFile(o.manifest, ' '.repeat(65537))]) await fixture(async options => {
    await change(options); const h = host(); await assert.rejects(deliver(options, h.transport));
    assert.deepEqual(h.calls, []);
  });
});

test('runner config is separate, private and canonical; arbitrary options/user deny', async () => {
  const dir = await mkdtemp(join(resolve('.'), '.ssh-runner-test-'));
  try {
    const c = { ...config, private_key: join(dir, 'key'), known_hosts: join(dir, 'hosts') };
    await writeFile(c.private_key, 'synthetic-noncredential', { mode: 0o600 });
    await writeFile(c.known_hosts, 'synthetic-host-entry');
    const file = join(dir, 'runner.json'); await writeFile(file, JSON.stringify(c), { mode: 0o600 });
    assert.deepEqual(await runnerConfig(file), c);
    await chmod(c.private_key, 0o644); await assert.rejects(runnerConfig(file));
    await chmod(c.private_key, 0o600);
    await writeFile(file, JSON.stringify({ ...c, options: ['ProxyCommand=bad'] }));
    await assert.rejects(runnerConfig(file));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('actual root nanosecond JSON integers are accepted, duplicate response keys denied', async () => {
  await fixture(async options => {
    const h = host(verb => ['activate', 'receipt'].includes(verb) ? { code: 0,
      stdout: Buffer.from(canonical(terminal).replace('"started_at_ns":1000',
        '"started_at_ns":1750000000123456789') + '\n') } : undefined);
    await deliver(options, h.transport);
  });
  await fixture(async options => {
    const h = host(verb => verb === 'admit' ? response({ ...admission, previous_sha: 'unknown' }) : undefined);
    await assert.rejects(deliver(options, h.transport), /admission-binding/);
    assert.equal(h.calls.some(x => x.startsWith('activate ')), false);
  });
  await fixture(async options => {
    const h = host(verb => verb === 'status' ? { code: 0,
      stdout: Buffer.from('{"environment":"production-hetzner","latch":true,"latch":false}\n') } : undefined);
    await assert.rejects(deliver(options, h.transport));
    assert.deepEqual(h.calls, ['status']);
  });
});


test('finite OCI archive verifier output retains canonical seven-key evidence in client', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sm-canonical-client-'));
  try {
    const verified = execFileSync(process.env.SSH_TEST_PYTHON || 'python3', ['-I', '-B', '-c', `
import sys, json, hashlib
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from test_support import layered_archive, layer, SHA, RUN, MIGRATION
from archive import inspect_archive
root = Path(sys.argv[2])
sql = b'SELECT 1;'
fixture, descriptor = layered_archive(root, [layer([
    ('app/prisma/migrations/' + MIGRATION + '/migration.sql', sql)])], modern=True)
path, image, checksum = fixture
proof = inspect_archive(path, checksum, image, SHA, RUN, '/app/prisma/migrations')
print(json.dumps(dict(sha=SHA, ci_run_id=RUN, archive_sha256=checksum,
    image_id=image, archive_bytes=path.stat().st_size, **proof)))
`, resolve('ops/release/hetzner'), dir], { timeout: 30000, maxBuffer: 65536 });
    const candidate = JSON.parse(verified);
    const accepted = validateManifest(candidate, sha, run);
    assert.deepEqual(accepted, candidate);
    assert.deepEqual(Object.keys(accepted).sort(), ['archive_bytes', 'archive_sha256',
      'ci_run_id', 'image_graph', 'image_id', 'migrations', 'sha']);
    assert.deepEqual(accepted.migrations, [{ name: '20261001000000_initial',
      checksum: createHash('sha256').update('SELECT 1;').digest('hex') }]);
    const graph = accepted.image_graph;
    assert.equal(graph.kind, 'oci-manifest');
    assert.equal(graph.root_digest, accepted.image_id);
    assert.equal(graph.descriptor.digest, accepted.image_id);
    assert.equal(graph.config.digest, graph.config_digest);
    assert.equal(new Set([accepted.archive_sha256, accepted.image_id, graph.config_digest]).size, 3);
    assert.equal(graph.layers.length, 1); assert.equal(graph.diff_ids.length, 1);
    assert.notEqual(graph.layers[0].digest, graph.diff_ids[0]);
    assert.ok(graph.layers[0].size > 0 && graph.config.size > 0 && graph.descriptor.size > 0);
    const options = { manifest: join(dir, 'manifest.json'), archive: join(dir, 'candidate.tar'),
      phases: join(dir, 'phases.jsonl'), sha, run };
    await writeFile(options.manifest, verified);
    const uploaded = [];
    const h = host((verb) => verb === 'receive' ? response(candidate) : undefined);
    // Stop after actual bounded binary upload; later synthetic proofs use another image.
    await assert.rejects(deliver(options, async (wire, source) => {
      if (source) for await (const chunk of source()) uploaded.push(chunk);
      if (wire.startsWith('admit ')) throw new ClientError('synthetic-stop');
      return h.transport(wire);
    }), /synthetic-stop/);
    assert.deepEqual(Buffer.concat(uploaded), await readFile(options.archive));
    assert.equal(h.calls.filter(x => x.startsWith('receive ')).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('canonical 10GB maximum rejects larger candidate before files, journal or SSH effects', async () => {
  assert.equal(validateManifest({ ...manifest, archive_bytes: 10_000_000_000 }, sha, run).archive_bytes,
    10_000_000_000);
  assert.throws(() => command('receive', [sha, run, image, image, '10000000001']), /ssh-grammar/);
  assert.ok(command('receive', [sha, run, image, image, '10000000000']));
  await fixture(async options => {
    await writeFile(options.manifest, JSON.stringify({ ...manifest, archive_bytes: 10_000_000_001 }));
    await rm(options.archive);
    const h = host();
    await assert.rejects(deliver(options, h.transport), /candidate-manifest/);
    assert.deepEqual(h.calls, []);
    await assert.rejects(readFile(options.phases), { code: 'ENOENT' });
  });
});

test('nested overflow cannot compare equal to null in admission and receipt proofs', async () => {
  const graph = { ...admission.image_graph, layers: [{ size: null }] };
  for (const field of ['image_graph', 'compatibility', 'backup', 'snapshot_before']) {
    await fixture(async options => {
      const proof = { ...admission, [field]: { nested: [{ size: null }] } };
      const matched = field === 'snapshot_before' ? terminal : { ...terminal, [field]: proof[field] };
      const h = host(verb => verb === 'admit' ? { code: 0,
        stdout: Buffer.from(canonical(proof).replace('"size":null', '"size":1e999')) } :
        ['activate', 'receipt'].includes(verb) ? response(matched) : undefined);
      await assert.rejects(deliver(options, h.transport), /response-malformed/);
      assert.equal(h.calls.some(x => x.startsWith('activate ')), false);
    });
  }
  await fixture(async options => {
    await writeFile(options.manifest, canonical({ ...manifest,
      image_graph: { layers: [{ size: null }] } }).replace('"size":null', '"size":-1e999'));
    const h = host();
    await assert.rejects(deliver(options, h.transport), /json-finite/);
    assert.deepEqual(h.calls, []);
    await assert.rejects(readFile(options.phases), { code: 'ENOENT' });
  });
  await fixture(async options => {
    const h = host(verb => ['activate', 'receipt'].includes(verb) ? { code: 0,
      stdout: Buffer.from(canonical({ ...terminal, backup: { nested: [null] } })
        .replace('[null]', '[1e999]')) } : undefined);
    await assert.rejects(deliver(options, h.transport), /response-malformed/);
    assert.equal(h.calls.filter(x => x.startsWith('activate ')).length, 1);
    assert.doesNotMatch(await readFile(options.phases, 'utf8'), /completed/);
  });
  for (const number of [Infinity, -Infinity, NaN]) {
    assert.throws(() => receipt({ ...terminal, image_graph: graph }, manifest,
      { ...admission, image_graph: { ...graph, layers: [{ size: number }] } }), /json-finite/);
    assert.throws(() => validateManifest({ ...manifest,
      image_graph: { nested: [number] } }, sha, run), /json-finite/);
  }
  await fixture(async options => {
    const proof = { ...admission, image_graph: graph };
    const h = host(verb => verb === 'admit' ? response(proof) :
      ['activate', 'receipt'].includes(verb) ? response({ ...terminal, image_graph: graph }) : undefined);
    assert.deepEqual(await deliver(options, h.transport), { phase: 'completed' });
  });
});
