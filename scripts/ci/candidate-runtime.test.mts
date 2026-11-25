import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, chown, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { artifacts, directory, fileHash, hash, canonical, history, manifest, owned, proof, ready, containerNetwork, object } from './candidate-runtime-contract.mts';
import { failureReason, parseArgs } from './candidate-runtime.mts';
import type { Binding, Resource, RuntimeProof, Row } from './candidate-runtime-contract.mts';

test('failure reasons admit only complete bounded lowercase tokens', () => {
  for (const message of ['probe-denied', '0', 'a'.repeat(64)])
    assert.equal(failureReason(new Error(message)), message);
  for (const message of ['', 'a'.repeat(65), 'Probe-denied', 'probe_denied',
    '/private/credential', 'postgresql://user:secret@host/db', 'opaque sensitive marker',
    '{"secret":"value"}', 'probe-denied\n', 'probe-denied\r', 'probe-denied\r\n',
    'probe-denied\u0000', 'é']) {
    assert.equal(failureReason(new Error(message)), 'unclassified');
  }
  for (const value of [null, undefined, 'probe-denied', { message: 'probe-denied' }])
    assert.equal(failureReason(value), 'unclassified');
});

test('spawned runtime CLI emits safe reasons and redacts actual filesystem errors', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sm-runtime-stderr-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await chmod(root, 0o700);
  const runtime = fileURLToPath(new URL('./candidate-runtime.mts', import.meta.url));
  const invoke = (directory: string) => spawnSync(process.execPath,
    ['--no-warnings', '--experimental-strip-types', runtime,
      '--directory', directory, '--source', root,
      '--sha', 'c9dd4f5b903c777a6a378e3233b5353d08702424', '--run-id', '123',
      '--image-id', 'sha256:' + 'a'.repeat(64),
      '--archive-sha256', 'sha256:' + 'b'.repeat(64),
      '--manifest-sha256', 'sha256:' + 'c'.repeat(64)],
    { encoding: 'utf8', timeout: 15_000, maxBuffer: 65_536 });
  // Identical admitted source/directory paths fail before any daemon access.
  const approved = invoke(root);
  assert.ifError(approved.error);
  assert.equal(approved.status, 1);
  assert.equal(approved.stdout, '');
  assert.equal(approved.stderr, 'candidate-runtime: runtime-directory\n');
  // ENOENT naturally includes this path in error.message; it must not escape.
  const redacted = invoke(path.join(root, 'missing-opaque-sensitive-marker'));
  assert.ifError(redacted.error);
  assert.equal(redacted.status, 1);
  assert.equal(redacted.stdout, '');
  assert.equal(redacted.stderr, 'candidate-runtime: unclassified\n');
});

const digest = (c: string): string => 'sha256:' + c.repeat(64);
const sha = 'c9dd4f5b903c777a6a378e3233b5353d08702424';
const pool = { name: 'postgres_runtime_pool', status: 'ok',
  detail: 'A query completed through the bounded shared Prisma pool.' };
const response = (checks: unknown[]): unknown => ({ http_status: 200,
  body: { status: 'ok', service: 'api-gateway', checks } });
const inventory = [{ name: '20260101000000_initial', checksum: 'e'.repeat(64) }];
const fixture = () => manifest({ sha, ci_run_id: '123', image_id: digest('a'),
  archive_sha256: hash('actual fixture archive'), archive_bytes: Buffer.byteLength('actual fixture archive'),
  migrations: inventory, image_graph: { kind: 'oci-manifest', root_digest: digest('a'),
    config_digest: digest('b'), descriptor: { digest: digest('a'), size: 410,
      mediaType: 'application/vnd.oci.image.manifest.v1+json' },
    config: { digest: digest('b'), size: 300, mediaType: 'application/vnd.oci.image.config.v1+json' },
    layers: [{ digest: digest('c'), size: 10240, mediaType: 'application/vnd.oci.image.layer.v1.tar' }],
    diff_ids: [digest('c')] } });

test('actual readiness contract requires one completed pool query and bounded unique checks', () => {
  assert.equal(ready(response([pool, { name: 'metrics', status: 'degraded' }])), true);
  for (const checks of [[], [{ ...pool, status: 'degraded' }], [{ ...pool, status: 'skipped' }],
    [{ ...pool, skipped: true }], [{ ...pool, enabled: false }], [{ ...pool, detail: 'Pool was skipped.' }],
    [pool, pool], [pool, { name: '', status: 'ok' }], [pool, { name: '../foreign', status: 'ok' }],
    [pool, ...Array.from({ length: 32 }, (_, i) => ({ name: `metric_${i}`, status: 'ok' }))]]) {
    assert.throws(() => ready(response(checks)));
  }
  assert.throws(() => ready({ http_status: 503, body: { status: 'ok', service: 'api-gateway', checks: [pool] } }));
  assert.throws(() => ready({ http_status: 200,
    body: { status: 'ok', ready: false, service: 'api-gateway', checks: [pool] } }));
});

test('history must equal the complete manifest with no pending, rolled, unknown or duplicate row', () => {
  const m = fixture(), rows = inventory.map(v => ({ ...v, finished_at: 'actual-time', rolled_back_at: null }));
  assert.equal(history(rows, m), hash(canonical(inventory)));
  for (const value of [[], [...rows, ...rows], [{ ...rows[0], checksum: '0'.repeat(64) }],
    [{ ...rows[0], finished_at: null }], [{ ...rows[0], rolled_back_at: 'actual-time' }],
    [...rows, { name: '20260102000000_unknown', checksum: '0'.repeat(64),
      finished_at: 'actual-time', rolled_back_at: null }]]) assert.throws(() => history(value, m));
});

test('real retained files bind proof and reject archive, manifest and symlink substitutions', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sm-runtime-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const m = fixture(), mf = path.join(root, 'manifest.json'), archive = path.join(root, 'candidate.tar');
  await writeFile(mf, JSON.stringify(m), { mode: 0o600 });
  await writeFile(archive, 'actual fixture archive', { mode: 0o600 });
  const binding: Binding = { sha, ci_run_id: '123', image_id: m.image_id,
    archive_sha256: m.archive_sha256, manifest_sha256: (await fileHash(mf)).sha256 };
  assert.deepEqual(await artifacts(root, binding), m);
  const evidence: RuntimeProof = { schema: 'social-monitor-candidate-runtime-v1', ...binding,
    daemon_id: 'isolated-test-daemon', postgres_system_identifier: '7688442011877063483',
    postgres_major: 18, api_container_id: '1'.repeat(64), api_started_at: '2026-10-04T01:02:03.000000000Z',
    history_sha256: hash(canonical(m.migrations)), postgres_pool_ok: true, cleanup_verified: true };
  assert.deepEqual(proof(evidence, binding, evidence.daemon_id, m), evidence);
  for (const bad of [{ ...evidence, cleanup_verified: false }, { ...evidence, postgres_pool_ok: false },
    { ...evidence, postgres_system_identifier: '7688442011877063482' },
    { ...evidence, postgres_system_identifier: '18446744073709551616' },
    { ...evidence, postgres_major: 17 }, { ...evidence, history_sha256: digest('f') },
    { ...evidence, unexpected: true }]) assert.throws(() => proof(bad, binding, evidence.daemon_id, m));
  assert.throws(() => proof(evidence, binding, 'other-test-daemon', m));
  const original = await readFile(archive); await writeFile(archive, 'changed fixture archive');
  await assert.rejects(artifacts(root, binding), /archive-changed/);
  await writeFile(archive, original); await writeFile(mf, JSON.stringify({ ...m, archive_bytes: m.archive_bytes + 1 }));
  await assert.rejects(artifacts(root, binding), /manifest-changed/);
  const alias = path.join(root, 'alias'); await symlink(archive, alias);
  await assert.rejects(fileHash(alias), /noncanonical-file/);
  await chmod(archive, 0o666); await assert.rejects(fileHash(archive), /untrusted-file/);
});

test('root-owned private data rejects a traversable attacker-owned ancestor', async t => {
  if (process.platform !== 'linux' || process.geteuid?.() !== 0) {
    t.skip('Ownership regression requires Linux and effective UID 0.'); return;
  }
  const outer = await mkdtemp(path.join(os.tmpdir(), 'sm-runtime-ancestor-'));
  const attacker = path.join(outer, 'attacker'), privateRoot = path.join(attacker, 'private');
  const file = path.join(privateRoot, 'file');
  let attackerOwned = false;
  t.after(async () => {
    if (attackerOwned) await chown(attacker, 0, process.getegid?.() ?? 0);
    await rm(outer, { recursive: true, force: true });
  });
  await chmod(outer, 0o755);
  await mkdir(attacker, { mode: 0o755 });
  await mkdir(privateRoot, { mode: 0o700 });
  await writeFile(file, 'private fixture data', { mode: 0o600 });
  await directory(privateRoot, true);
  assert.equal((await fileHash(file)).sha256, 'sha256:403805d3848c936160afd8eff28869bdb106bd1ef00706840bd05826a315a1f3');
  await chown(attacker, 65534, 65534);
  attackerOwned = true;
  await assert.rejects(directory(privateRoot, true), /untrusted-directory/);
  await assert.rejects(fileHash(file), /untrusted-directory/);
});

test('ownership contract denies foreign labels, replaced IDs, image changes and host exposure', () => {
  const m = fixture(), binding: Binding = { sha, ci_run_id: '123', image_id: m.image_id,
    archive_sha256: m.archive_sha256, manifest_sha256: digest('d') };
  const nonce = '1'.repeat(24), name = `sm-ci-runtime-${nonce}-api`;
  const r: Resource = { role: 'api', kind: 'container', name, reference: m.image_id,
    image: m.image_id, id: '2'.repeat(64), pending: false };
  const row = { Id: r.id, Name: '/' + name, Image: r.image,
    Config: { Image: r.reference, Labels: { 'io.social-monitor.ci-runtime': nonce,
      'io.social-monitor.ci-runtime.role': 'api', 'org.opencontainers.image.revision': sha,
      'social-monitor.ci-run-id': '123' } },
    HostConfig: { Privileged: false, PublishAllPorts: false, PortBindings: {}, Binds: [],
      CapAdd: [], Devices: [], PidMode: '', IpcMode: 'private' }, NetworkSettings: { Ports: { '3000/tcp': null } } };
  assert.equal(owned(row, r, nonce, binding).Id, r.id);
  for (const bad of [{ ...row, Id: '3'.repeat(64) }, { ...row, Image: digest('f') },
    { ...row, Config: { ...row.Config, Labels: { ...row.Config.Labels, 'io.social-monitor.ci-runtime': 'foreign' } } },
    { ...row, HostConfig: { ...row.HostConfig, Privileged: true } },
    { ...row, HostConfig: { ...row.HostConfig, Binds: ['/foreign:/app'] } },
    { ...row, NetworkSettings: { Ports: { '3000/tcp': [{ HostPort: '3000' }] } } }]) {
    assert.throws(() => owned(bad, r, nonce, binding));
  }
});

test('runtime CLI has only the seven fixed required arguments', () => {
  const args = ['--directory', '/tmp/candidate', '--source', '/checkout', '--sha', sha,
    '--run-id', '123', '--image-id', digest('a'), '--archive-sha256', digest('b'),
    '--manifest-sha256', digest('c')];
  assert.equal(parseArgs(args).binding.sha, sha);
  assert.throws(() => parseArgs(args.slice(0, -2)));
  assert.throws(() => parseArgs([...args, '--callback', '/foreign']));
  assert.throws(() => parseArgs([...args, '--source', '/other']));
});

// Relevant fields transcribed from the independent Docker 29.8.2 observations.
const nativeNetwork: Resource = { role: 'network', kind: 'network',
  name: 'sm-ci-runtime-diag-b8614d677bde0685', reference: null, image: null,
  id: '13dd3ceb8756651a5ecc4cd0031129c7f3d13edc19d7a7c1ac8111874d7dd08d', pending: false };
const nativeRedis: Resource = { role: 'redis', kind: 'container',
  name: 'sm-ci-runtime-diag-b8614d677bde0685-redis', reference: null, image: null,
  id: '5e85302fd825f2772bc55a40db895b6d30dab6b17482261688bb1a65cb4d0e1d', pending: false };
const nativeCreated = {
  State: { Status: 'created', Running: false, Paused: false, Restarting: false,
    OOMKilled: false, Dead: false, Pid: 0, ExitCode: 0, Error: '',
    StartedAt: '0001-01-01T00:00:00Z', FinishedAt: '0001-01-01T00:00:00Z' },
  HostConfig: { NetworkMode: 'sm-ci-runtime-diag-b8614d677bde0685' },
  NetworkSettings: { Networks: { 'sm-ci-runtime-diag-b8614d677bde0685': {
    IPAMConfig: null, Links: null, Aliases: ['redis'], DriverOpts: null, GwPriority: 0,
    NetworkID: '', EndpointID: '', Gateway: '', IPAddress: '', MacAddress: '',
    IPPrefixLen: 0, IPv6Gateway: '', GlobalIPv6Address: '', GlobalIPv6PrefixLen: 0, DNSNames: null,
  } } },
};
const nativeRunning = {
  State: { Status: 'running', Running: true, Paused: false, Restarting: false,
    OOMKilled: false, Dead: false, Pid: 4043, ExitCode: 0, Error: '',
    StartedAt: '2026-10-04T03:03:29.300348216Z', FinishedAt: '0001-01-01T00:00:00Z' },
  HostConfig: { NetworkMode: 'sm-ci-runtime-diag-b8614d677bde0685' },
  NetworkSettings: { Networks: { 'sm-ci-runtime-diag-b8614d677bde0685': {
    IPAMConfig: null, Links: null, Aliases: ['redis'], DriverOpts: null, GwPriority: 0,
    NetworkID: '13dd3ceb8756651a5ecc4cd0031129c7f3d13edc19d7a7c1ac8111874d7dd08d',
    EndpointID: '8ef21eec45f2b202b7046f6e81ec2ab72d075c1630a74018c79b3ae33f58b42d',
    Gateway: '', IPAddress: '172.19.0.2', MacAddress: 'ae:f6:c0:bb:d4:0e', IPPrefixLen: 16,
    IPv6Gateway: '', GlobalIPv6Address: '', GlobalIPv6PrefixLen: 0,
    DNSNames: ['sm-ci-runtime-diag-b8614d677bde0685-redis', 'redis', '5e85302fd825'],
  } } },
};
const nativeExited = {
  State: { Status: 'exited', Running: false, Paused: false, Restarting: false,
    OOMKilled: false, Dead: false, Pid: 0, ExitCode: 0, Error: '',
    StartedAt: '2026-10-04T03:03:29.300348216Z', FinishedAt: '2026-10-04T03:03:29.876924927Z' },
  HostConfig: { NetworkMode: 'sm-ci-runtime-diag-b8614d677bde0685' },
  NetworkSettings: { Networks: { 'sm-ci-runtime-diag-b8614d677bde0685': {
    IPAMConfig: null, Links: null, Aliases: ['redis'], DriverOpts: null, GwPriority: 0,
    NetworkID: '13dd3ceb8756651a5ecc4cd0031129c7f3d13edc19d7a7c1ac8111874d7dd08d',
    EndpointID: '', Gateway: '', IPAddress: '', MacAddress: '', IPPrefixLen: 0,
    IPv6Gateway: '', GlobalIPv6Address: '', GlobalIPv6PrefixLen: 0,
    DNSNames: ['sm-ci-runtime-diag-b8614d677bde0685-redis', 'redis', '5e85302fd825'],
  } } },
};
const nativeExtract = {
  State: { Status: 'created', Running: false, Paused: false, Restarting: false,
    OOMKilled: false, Dead: false, Pid: 0, ExitCode: 0, Error: '',
    StartedAt: '0001-01-01T00:00:00Z', FinishedAt: '0001-01-01T00:00:00Z' },
  HostConfig: { NetworkMode: 'none' },
  NetworkSettings: { Networks: { none: {
    IPAMConfig: null, Links: null, Aliases: null, DriverOpts: null, GwPriority: 0,
    NetworkID: '', EndpointID: '', Gateway: '', IPAddress: '', MacAddress: '',
    IPPrefixLen: 0, IPv6Gateway: '', GlobalIPv6Address: '', GlobalIPv6PrefixLen: 0, DNSNames: null,
  } } },
};
function changeEndpoint(row: Row, name: string, patch: Row): Row {
  const changed = structuredClone(row);
  Object.assign(object(object(object(changed.NetworkSettings).Networks)[name]), patch);
  return changed;
}

test('native created, running and exited bindings retain the owned network fence', () => {
  // The old equality check rejects nativeCreated: its NetworkID is empty before START.
  for (const row of [nativeCreated, nativeRunning, nativeExited]) {
    assert.doesNotThrow(() => containerNetwork(row, nativeRedis, nativeNetwork));
    for (const id of ['f'.repeat(64), null, undefined])
      assert.throws(() => containerNetwork(changeEndpoint(row, nativeNetwork.name,
        { NetworkID: id }), nativeRedis, nativeNetwork));
    assert.throws(() => containerNetwork({ ...row,
      HostConfig: { NetworkMode: 'bridge' } }, nativeRedis, nativeNetwork));
    const endpoint = row.NetworkSettings.Networks[nativeNetwork.name as
      keyof typeof row.NetworkSettings.Networks];
    for (const networks of [{ foreign: endpoint }, {},
      { ...row.NetworkSettings.Networks, foreign: endpoint }])
      assert.throws(() => containerNetwork({ ...row,
        NetworkSettings: { Networks: networks } }, nativeRedis, nativeNetwork));
    assert.throws(() => containerNetwork(changeEndpoint(row, nativeNetwork.name,
      { Aliases: [] }), nativeRedis, nativeNetwork));
    assert.throws(() => containerNetwork(row, nativeRedis, { ...nativeNetwork, id: null }));
    // A never-started configuration is fenced by the caller's owned-network inspect.
    if (row !== nativeCreated)
      assert.throws(() => containerNetwork(row, nativeRedis, { ...nativeNetwork, id: 'f'.repeat(64) }));
  }
});

test('empty configured network IDs require a consistent never-started lifecycle', () => {
  for (const row of [nativeRunning, nativeExited])
    assert.throws(() => containerNetwork(changeEndpoint(row, nativeNetwork.name,
      { NetworkID: '' }), nativeRedis, nativeNetwork));
  for (const patch of [{ Status: 'exited' }, { Running: true }, { Paused: true },
    { Restarting: true }, { Dead: true }, { OOMKilled: true }, { Pid: 4043 },
    { ExitCode: 1 }, { Error: 'failed' }, { StartedAt: nativeRunning.State.StartedAt },
    { StartedAt: undefined }, { FinishedAt: nativeExited.State.FinishedAt }])
    assert.throws(() => containerNetwork({ ...nativeCreated,
      State: { ...nativeCreated.State, ...patch } }, nativeRedis, nativeNetwork));
  for (const patch of [{ EndpointID: 'e'.repeat(64) }, { IPAddress: '172.19.0.2' },
    { Gateway: '172.19.0.1' }, { MacAddress: 'ae:f6:c0:bb:d4:0e' }, { IPPrefixLen: 16 },
    { IPv6Gateway: 'fd00::1' }, { GlobalIPv6Address: 'fd00::2' },
    { GlobalIPv6PrefixLen: 64 }, { IPAMConfig: { IPv4Address: '172.19.0.2' } }])
    assert.throws(() => containerNetwork(changeEndpoint(nativeCreated, nativeNetwork.name,
      patch), nativeRedis, nativeNetwork));
});

test('native extract uses the single none entry and denies connectivity', () => {
  const extract: Resource = { ...nativeRedis, role: 'extract' };
  // The old zero-key check rejects this literal native extract observation.
  assert.doesNotThrow(() => containerNetwork(nativeExtract, extract, nativeNetwork));
  for (const networks of [{}, { bridge: nativeExtract.NetworkSettings.Networks.none },
    { host: nativeExtract.NetworkSettings.Networks.none },
    { ...nativeExtract.NetworkSettings.Networks, bridge: nativeRunning.NetworkSettings.Networks[nativeNetwork.name as keyof typeof nativeRunning.NetworkSettings.Networks] }])
    assert.throws(() => containerNetwork({ ...nativeExtract,
      NetworkSettings: { Networks: networks } }, extract, nativeNetwork));
  for (const patch of [{ NetworkID: nativeNetwork.id }, { EndpointID: 'e'.repeat(64) },
    { IPAddress: '172.19.0.2' }, { Gateway: '172.19.0.1' }, { MacAddress: 'ae:f6:c0:bb:d4:0e' },
    { IPPrefixLen: 16 }, { IPv6Gateway: 'fd00::1' }, { GlobalIPv6Address: 'fd00::2' },
    { GlobalIPv6PrefixLen: 64 }, { Aliases: ['redis'] }, { Links: ['foreign'] },
    { DNSNames: ['foreign'] }, { IPAMConfig: { IPv4Address: '172.19.0.2' } }])
    assert.throws(() => containerNetwork(changeEndpoint(nativeExtract, 'none', patch), extract, nativeNetwork));
});
