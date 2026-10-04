import assert from 'node:assert/strict';
import { chmod, chown, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { artifacts, directory, fileHash, hash, canonical, history, manifest, owned, proof, ready } from './candidate-runtime-contract.mts';
import { parseArgs } from './candidate-runtime.mts';
import type { Binding, Resource, RuntimeProof } from './candidate-runtime-contract.mts';

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
