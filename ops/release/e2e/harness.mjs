#!/usr/bin/env node
/* global process */
// The driver only provisions/cleans disposable fixtures. All controller verbs,
// denials and terminal receipts travel over real forced-command SSH here.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdtemp, open, realpath, statfs, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomic, checksum, command, DIGEST, qualify, readJson, SHA, validateManifest } from '../../../scripts/ci/release-candidate.mjs';

const required = ['api', 'postgres', 'ssh', 'jev-agent-runtime', 'jev-intelligence-worker', 'social-x-collector'];
async function snapshot(project, directory) {
  const ids = (await command('docker', ['ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project])).trim().split(/\s+/).filter(Boolean);
  assert.ok(ids.length >= required.length && ids.length <= 32, 'disposable-container-count');
  const rows = JSON.parse(await command('docker', ['inspect', ...ids]));
  const result = {};
  for (const row of rows) {
    assert.equal(row.Config.Labels['com.docker.compose.project'], project);
    const service = row.Config.Labels['com.docker.compose.service'];
    assert.ok(!result[service], 'duplicate-fixture-service');
    assert.equal(row.State.Running, true, 'fixture-container-stopped');
    assert.ok(!row.HostConfig.Privileged && row.HostConfig.NetworkMode !== 'host'
      && row.HostConfig.PidMode !== 'host' && row.HostConfig.IpcMode !== 'host', 'fixture-host-access');
    for (const bindings of Object.values(row.NetworkSettings.Ports || {})) {
      for (const binding of bindings || []) assert.equal(binding.HostIp, '127.0.0.1', 'fixture-public-port');
    }
    for (const mount of row.Mounts || []) {
      if (mount.Type === 'bind') {
        assert.ok((await realpath(mount.Source)).startsWith(directory + path.sep), 'fixture-foreign-bind');
      } else if (mount.Type === 'volume') {
        const volume = JSON.parse(await command('docker', ['volume', 'inspect', mount.Name]));
        assert.equal(volume[0]?.Labels?.['com.docker.compose.project'], project, 'fixture-foreign-volume');
      } else assert.equal(mount.Type, 'tmpfs', 'fixture-unknown-mount');
    }
    for (const network of Object.keys(row.NetworkSettings.Networks || {})) {
      const model = JSON.parse(await command('docker', ['network', 'inspect', network]));
      assert.equal(model[0]?.Labels?.['com.docker.compose.project'], project, 'fixture-foreign-network');
    }
    result[service] = { id: row.Id, image: row.Image, started: row.State.StartedAt, running: row.State.Running };
  }
  required.forEach(service => assert.ok(result[service], 'missing-fixture-service:' + service));
  return result;
}
function nonTargets(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(([service]) => service !== 'api'));
}
async function ready(target) {
  const result = await command('docker', ['exec', target.id, 'node', '-e',
    "fetch('http://127.0.0.1:3000/ready',{signal:AbortSignal.timeout(10000)}).then(async r=>{const b=await r.json();if(r.status!==200||b.status!=='ok'||b.service!=='api-gateway')process.exit(1);process.stdout.write('ready')}).catch(()=>process.exit(1))"]);
  assert.equal(result, 'ready');
  const rows = JSON.parse(await command('docker', ['inspect', target.id]));
  assert.equal(rows[0].Image, target.image);
  assert.equal(rows[0].State.StartedAt, target.started);
  assert.equal(rows[0].State.Running, true);
}
async function fixturePath(directory, value) {
  assert.equal(typeof value, 'string');
  const resolved = await realpath(value);
  assert.ok(resolved.startsWith(directory + path.sep), 'ssh-path-outside-fixture');
  return resolved;
}

export function validateSshPort(container, project, port) {
  assert.equal(container.Config?.Labels?.['com.docker.compose.project'], project, 'ssh-container-project');
  assert.equal(container.Config?.Labels?.['com.docker.compose.service'], 'ssh', 'ssh-container-service');
  assert.ok(container.NetworkSettings?.Ports?.['22/tcp']?.some(binding =>
    binding.HostIp === '127.0.0.1' && binding.HostPort === String(port)), 'ssh-port-outside-fixture');
}
async function foreignTags() {
  const output = await command('docker', ['image', 'ls', '--no-trunc', '--format', '{{json .}}']);
  const tags = {};
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const item = JSON.parse(line);
    if (item.Repository === '<none>' || item.Tag === '<none>') continue;
    // Controller v1 retains immutable owned aliases; all foreign tags must stay.
    if (/^smrel-keep-[0-9a-f]{64}$/.test(item.Repository) && item.Tag === 'latest') continue;
    const name = item.Repository + ':' + item.Tag;
    assert.ok(!tags[name] || tags[name] === item.ID, 'ambiguous-daemon-tag');
    tags[name] = item.ID;
  }
  return tags;
}

export function controllerDenial(error, reason) {
  assert.equal(error.exitCode, 1, 'controller-denial-exit');
  const payload = JSON.parse(error.stdout);
  assert.deepEqual(Object.keys(payload), ['denied'], 'controller-denial-fields');
  assert.equal(payload.denied, reason, 'controller-denial-reason');
  return reason;
}
export async function requireGrammarDenial(operation) {
  await assert.rejects(operation, error => controllerDenial(error, 'grammar') === 'grammar');
}
export function validateReceipt(receipt, manifest, baselineId, outcome) {
  assert.ok(['activated', 'rolled-back'].includes(outcome), 'receipt-outcome-kind');
  assert.equal(receipt.schema, 'social-monitor-release-receipt-v1');
  for (const field of ['sha', 'ci_run_id', 'archive_sha256', 'image_id']) {
    assert.equal(receipt[field], manifest[field], 'receipt-' + field);
  }
  assert.equal(receipt.previous_image_id, baselineId);
  assert.ok(typeof receipt.previous_sha === 'string' && SHA.test(receipt.previous_sha));
  assert.deepEqual(receipt.image_graph, manifest.image_graph);
  assert.deepEqual(receipt.scope, ['api']);
  assert.equal(receipt.migration_status, 'unchanged');
  assert.equal(receipt.outcome, outcome);
  assert.ok(typeof receipt.snapshot_before_hash === 'string' && DIGEST.test(receipt.snapshot_before_hash));
  assert.equal(receipt.snapshot_after_hash, receipt.snapshot_before_hash);
  assert.deepEqual(receipt.probes, outcome === 'activated' ? { target: true } : { target: false, previous: true });
  return receipt;
}

export async function createDisposableFixture({ candidateDirectory, baselineId, manifest }) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sm-release-e2e-')));
  const project = 'sm-rc-e2e-' + randomBytes(8).toString('hex');
  const fixture = path.join(directory, 'fixture.json');
  await atomic(fixture, { version: 1, directory, project, candidate_directory: await realpath(candidateDirectory),
    baseline_image_id: baselineId, candidate: manifest });
  return { directory, project, fixture, resolvePath: value => fixturePath(directory, value) };
}

export async function harness({ candidateDirectory, controllerDir, driver, baselineId }) {
  assert.ok(typeof baselineId === 'string' && DIGEST.test(baselineId), 'full-baseline-image-id-required');
  driver = await realpath(driver);
  const manifest = validateManifest(await readJson(path.join(candidateDirectory, 'manifest.json')));
  assert.notEqual(baselineId, manifest.image_id);
  const verified = await qualify({ directory: candidateDirectory, controllerDir,
    sha: manifest.sha, runId: manifest.ci_run_id }, manifest);
  assert.deepEqual(verified, manifest);
  const archive = path.join(candidateDirectory, 'candidate.tar');
  const disposable = await createDisposableFixture({ candidateDirectory, baselineId, manifest });
  const { directory, project, fixture } = disposable;
  const operation = async verb => JSON.parse(await command(driver, [verb, fixture], { cwd: directory, timeout: 300_000 }));
  let provisioned = false;
  try {
    provisioned = true;
    const connection = await operation('provision');
    assert.equal(connection.version, 1);
    assert.ok(Number.isInteger(connection.ssh_port) && connection.ssh_port > 1024 && connection.ssh_port < 65536);
    const key = await disposable.resolvePath(connection.ssh_key);
    const hosts = await disposable.resolvePath(connection.known_hosts);
    const ssh = ['-F', '/dev/null', '-i', key, '-p', String(connection.ssh_port),
      '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
      '-o', 'UserKnownHostsFile=' + hosts, '-o', 'ConnectTimeout=10', 'e2e@127.0.0.1'];
    const remote = async (verb, input) => JSON.parse(await command('ssh', [...ssh, verb], { input }));
    const denied = async (verb, input, reason) => {
      let failure;
      try { await remote(verb, input); } catch (error) { failure = error; }
      assert.ok(failure, 'controller-accepted-refused-case');
      return controllerDenial(failure, reason);
    };
    const before = await snapshot(project, directory);
    const sshContainer = JSON.parse(await command('docker', ['inspect', before.ssh.id]));
    validateSshPort(sshContainer[0], project, connection.ssh_port);
    await remote('status');
    await requireGrammarDenial(() => command('ssh', [...ssh, 'not-a-controller-verb']));
    const tagsBefore = await foreignTags();
    assert.equal(before.api.image, baselineId);
    const sql = query => command('docker', ['exec', before.postgres.id, 'psql',
      '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'e2e', '-d', 'e2e', '-Atc', query]);
    assert.ok(/^18[0-9]{4}\s*$/.test(await sql('show server_version_num')), 'real-postgres18-required');
    const version = JSON.parse(await command('docker', ['version', '--format', '{{json .Server}}']));
    const info = JSON.parse(await command('docker', ['info', '--format', '{{json .}}']));
    assert.match(version.Version, /^29\.[0-9]+\.[0-9]+$/);
    assert.equal(info.OSType, 'linux');
    assert.ok(['x86_64', 'amd64'].includes(info.Architecture), 'consumer-platform');
    assert.ok(info.DriverStatus?.some(row => row[0] === 'driver-type' && row[1] === 'io.containerd.snapshotter.v1'));
    await ready(before.api);
    await assert.rejects(command('docker', ['image', 'inspect', manifest.image_id]), /command-failed/);
    const receive = sha => ['receive', sha, manifest.ci_run_id, manifest.archive_sha256,
      manifest.image_id, manifest.archive_bytes].join(' ');
    const disk = await statfs(directory);
    assert.ok(disk.bavail * disk.bsize >= manifest.archive_bytes + 1024 ** 3, 'fixture-disk-space');
    const mutated = path.join(directory, 'mutated.tar');
    const refusals = {};
    try {
      await copyFile(archive, mutated, constants.COPYFILE_EXCL);
      const handle = await open(mutated, 'r+');
      try {
        const byte = Buffer.alloc(1);
        await handle.read(byte, 0, 1, 0);
        byte[0] ^= 1;
        await handle.write(byte, 0, 1, 0);
        await handle.sync();
      } finally { await handle.close(); }
      refusals.mutated_archive = await denied(receive(manifest.sha), mutated, 'archive-digest');
    } finally { await unlink(mutated).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    assert.deepEqual(await snapshot(project, directory), before);
    const wrongSha = (manifest.sha[0] === 'f' ? 'e' : 'f') + manifest.sha.slice(1);
    refusals.wrong_identity = await denied(receive(wrongSha), archive, 'image-labels');
    assert.deepEqual(await snapshot(project, directory), before);
    assert.deepEqual(await remote(receive(manifest.sha), archive), manifest);
    const keyName = manifest.sha + ' ' + manifest.ci_run_id;
    const rowId = randomUUID();
    const unknown = '99991231235959_e2e_' + rowId.replaceAll('-', '');
    assert.ok(!manifest.migrations.some(m => m.name === unknown));
    const history = () => sql('SELECT COALESCE(json_agg(row_to_json(m) ORDER BY id)::text,'
      + "'[]') FROM public." + '"_prisma_migrations" AS m');
    const historyBefore = await history();
    try {
      await sql('INSERT INTO public."_prisma_migrations" '
        + '(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES ('
        + "'" + rowId + "','" + '0'.repeat(64) + "',now(),'" + unknown + "',now(),1)");
      refusals.unknown_migration = await denied('admit ' + keyName, undefined, 'migration-required');
    } finally {
      await sql('DELETE FROM public."_prisma_migrations" WHERE id='
        + "'" + rowId + "' AND migration_name='" + unknown + "'");
    }
    assert.equal(await history(), historyBefore, 'fixture-migration-history-not-restored');
    assert.deepEqual(await snapshot(project, directory), before);
    await remote('admit ' + keyName);
    const activation = validateReceipt(await remote('activate ' + keyName), manifest, baselineId, 'activated');
    const activated = await snapshot(project, directory);
    assert.equal(activated.api.image, manifest.image_id);
    assert.notEqual(activated.api.id, before.api.id);
    assert.deepEqual(nonTargets(activated), nonTargets(before));
    await ready(activated.api);
    assert.deepEqual(await foreignTags(), tagsBefore, 'activation-mutated-foreign-tags');
    assert.deepEqual(await remote('receipt ' + manifest.sha + '-' + manifest.ci_run_id), activation);
    const confirmation = await remote('verify ' + keyName);
    assert.equal(confirmation.verified, true);
    assert.equal(confirmation.image_id, manifest.image_id);
    const observed = JSON.parse(await command('docker', ['image', 'inspect', manifest.image_id]));
    assert.equal(observed[0].Id, manifest.image_id);
    assert.equal(observed[0].Descriptor.digest, manifest.image_id);
    assert.equal(observed[0].Descriptor.size, manifest.image_graph.descriptor.size);
    assert.equal(observed[0].Config.Labels['org.opencontainers.image.revision'], manifest.sha);
    assert.equal(observed[0].Config.Labels['social-monitor.ci-run-id'], manifest.ci_run_id);
    assert.deepEqual(observed[0].RootFS.Layers, manifest.image_graph.diff_ids);
    const rollback = validateReceipt(await remote('rollback ' + keyName), manifest, baselineId, 'rolled-back');
    const rolledBack = await snapshot(project, directory);
    assert.equal(rolledBack.api.image, baselineId);
    assert.deepEqual(nonTargets(rolledBack), nonTargets(before));
    await ready(rolledBack.api);
    assert.deepEqual(await foreignTags(), tagsBefore, 'rollback-mutated-foreign-tags');
    assert.deepEqual(await remote('receipt ' + manifest.sha + '-' + manifest.ci_run_id + '-rollback'), rollback);
    const bytes = await checksum(archive);
    assert.equal(bytes.sha256, manifest.archive_sha256);
    const evidence = { version: 1, project, sha: manifest.sha, ci_run_id: manifest.ci_run_id,
      image_id: manifest.image_id, archive_sha256: bytes.sha256, baseline_image_id: baselineId,
      docker_version: version.Version, refusals, before, activated, rolled_back: rolledBack,
      activation_receipt: activation, rollback_receipt: rollback, proof: 'docker-forced-ssh-pg18' };
    await atomic(path.join(directory, 'evidence.json'), evidence);
    return { directory, evidence };
  } finally {
    if (provisioned) await operation('cleanup');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [candidateDirectory, controllerDir, driver, baselineId] = process.argv.slice(2);
  harness({ candidateDirectory, controllerDir, driver, baselineId }).then(result => {
    process.stdout.write(JSON.stringify({ directory: result.directory, qualified: true }) + '\n');
  }).catch(error => { process.stderr.write('release-e2e: ' + error.message + '\n'); process.exitCode = 1; });
}
