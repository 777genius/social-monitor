import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Authority, Get } from './hetzner-release-authority.mjs';
import type { Transport } from './hetzner-release-client.mjs';
import { ClientError } from './hetzner-release-client.mjs';
const require = createRequire(resolve('scripts/ci/hetzner-release-observe.test.mts'));
const A: typeof import('./hetzner-release-authority.mjs') = require('./hetzner-release-authority.mts');
const O: typeof import('./hetzner-release-observe.mjs') = require('./hetzner-release-observe.mts');
const sha = 'a'.repeat(40), run = '123', image = 'sha256:' + 'b'.repeat(64);
const digest = (bytes: Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const files = ['candidate.tar', 'candidate.tar.sha256', 'manifest.json', 'phases.json', 'image-id.txt', 'source-sha.txt'];
const authority: Authority = { sha, run, attempt: 2, workflow: '30',
  jobs: Array.from({ length: 16 }, (_, i) => String(1000 + i)).sort(),
  artifact: '50', artifactName: `api-candidate-${sha}-${run}`,
  artifactDigest: image, artifactBytes: 4096 };

test('frontend candidate binds both lanes to the exact run and archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'TEST-sm-frontend-candidate-'));
  const tar = Buffer.from('synthetic frontend archive'), tarHash = createHash('sha256').update(tar).digest('hex');
  const proof = { base: authority, artifact: { id: '51', name: `frontend-candidate-${sha}-${run}-2`,
    digest: image, bytes: 1024 } };
  const manifest = { version: 1, sourceSha: sha, ciRunId: run, ciRunAttempt: '2',
    archive: { name: 'frontend-release.tgz', sha256: tarHash, bytes: tar.length },
    bundles: ['public', 'admin'].map(lane => ({ lane, sourceSha: sha, ciRunId: run, ciRunAttempt: '2',
      apiOrigin: lane === 'public' ? 'https://social-monitor.app' : 'https://admin.social-monitor.app' })) };
  const path = join(root, 'frontend-manifest.json');
  try {
    await writeFile(join(root, 'frontend-release.tgz'), tar);
    await writeFile(path, JSON.stringify(manifest));
    const accepted = await O.validateFrontendCandidate(root, proof);
    assert.equal(accepted.archive, join(root, 'frontend-release.tgz'));
    await chmod(path, 0o600);
    for (const candidate of [
      { ...manifest, ciRunAttempt: '1' },
      { ...manifest, archive: { ...manifest.archive, sha256: '0'.repeat(64) } },
      { ...manifest, bundles: [manifest.bundles[0], { ...manifest.bundles[1], apiOrigin: 'https://wrong.invalid' }] },
    ]) {
      await writeFile(path, JSON.stringify(candidate));
      await assert.rejects(O.validateFrontendCandidate(root, proof));
    }
    await assert.rejects(O.validateFrontendCandidate(root, { ...proof, artifact: { ...proof.artifact, name: 'wrong' } }),
      /frontend-artifact-missing/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('frontend transport ZIP accepts exactly its two regular files', async () => {
  for (const mode of ['valid', 'extra', 'traversal', 'symlink'] as const) {
    const root = await mkdtemp(join(tmpdir(), 'TEST-sm-frontend-zip-'));
    try {
      const zip = join(root, 'transport.zip'), target = join(root, 'data');
      await mkdir(target, { mode: 0o700 });
      execFileSync('/usr/bin/python3', ['-I', '-B', '-c', `
import stat,sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as z:
    z.writestr('frontend-release.tgz', b'archive')
    info=zipfile.ZipInfo('../frontend-manifest.json' if sys.argv[2]=='traversal' else 'frontend-manifest.json')
    if sys.argv[2]=='symlink': info.external_attr=(stat.S_IFLNK | 0o777) << 16
    z.writestr(info,b'manifest')
    if sys.argv[2]=='extra': z.writestr('extra',b'x')
`, zip, mode]);
      if (mode === 'valid') {
        await O.extractFrontendArtifact(zip, target);
        assert.deepEqual((await readdir(target)).sort(), ['frontend-manifest.json', 'frontend-release.tgz']);
      } else await assert.rejects(O.extractFrontendArtifact(zip, target));
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
async function fixture(body: (root: string, directory: string, bytes: Buffer) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'sm-release-observe-')), directory = join(root, 'data');
  const bytes = Buffer.from('candidate-data-only; no tar extraction or execution\n');
  const manifest = { sha, ci_run_id: run, archive_sha256: digest(bytes), image_id: image,
    archive_bytes: bytes.length, migrations: [{ name: '20261001000000_initial',
      checksum: createHash('sha256').update('fixture SQL inventory only').digest('hex') },
      { name: '20261002000000_second',
        checksum: createHash('sha256').update('second fixture SQL inventory only').digest('hex') }],
    image_graph: { kind: 'oci-manifest', root_digest: image,
      descriptor: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: image, size: 10 },
      config_digest: 'sha256:' + 'c'.repeat(64),
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: 'sha256:' + 'c'.repeat(64), size: 10 },
      layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: 'sha256:' + 'd'.repeat(64), size: 10 }],
      diff_ids: ['sha256:' + 'e'.repeat(64)] } };
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  // Synthetic TEST identities; independently serialize the complete migration inventory.
  const runtimeProof = { schema: 'social-monitor-candidate-runtime-v1', sha, ci_run_id: run,
    image_id: image, archive_sha256: manifest.archive_sha256,
    manifest_sha256: digest(manifestBytes), daemon_id: 'TEST:ephemeral-ci-daemon',
    postgres_system_identifier: '123456789', postgres_major: 18,
    api_container_id: 'f'.repeat(64), api_started_at: '2026-10-04T00:00:00.000Z',
    history_sha256: digest(Buffer.from(JSON.stringify(manifest.migrations
      .map(({ name, checksum }) => ({ checksum, name }))))),
    postgres_pool_ok: true, cleanup_verified: true };
  try {
    await mkdir(directory, { mode: 0o700 });
    const contents: Record<string, Buffer | string> = {
      'candidate.tar': bytes, 'manifest.json': manifestBytes,
      'candidate.tar.sha256': manifest.archive_sha256.slice(7) + '  candidate.tar\n',
      'source-sha.txt': sha + '\n', 'image-id.txt': image + '\n',
      'phases.json': JSON.stringify({ version: 2, sha, ci_run_id: run, phase: 'qualified',
        image_id: image, archive_sha256: manifest.archive_sha256,
        archive_bytes: bytes.length, manifest_sha256: digest(manifestBytes),
        runtime_proof: runtimeProof }) + '\n',
    };
    for (const [name, value] of Object.entries(contents))
      await writeFile(join(directory, name), value, { mode: 0o600 });
    await body(root, directory, bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
}
function zip(directory: string, target: string, mode = 'valid'): void {
  execFileSync('/usr/bin/python3', ['-I', '-B', '-c', `
import pathlib, stat, sys, zipfile
root, target, mode = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
names = ['candidate.tar', 'candidate.tar.sha256', 'manifest.json', 'phases.json', 'image-id.txt', 'source-sha.txt']
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as output:
    for name in names:
        info = zipfile.ZipInfo('../manifest.json' if mode == 'traversal' and name == 'manifest.json' else name)
        info.create_system = 3
        info.external_attr = ((stat.S_IFLNK if mode == 'symlink' and name == 'source-sha.txt' else stat.S_IFREG) | 0o600) << 16
        output.writestr(info, (root / name).read_bytes())
    if mode == 'extra': output.writestr('build-image.txt', b'excluded producer file')
    if mode == 'duplicate': output.writestr('source-sha.txt', b'duplicate')
`, directory, target, mode], { timeout: 30000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'ignore'] });
}

test('qualified metadata cannot bypass version 2 runtime proof or exact artifact bindings', async () => {
  const changes: Record<string, unknown>[] = [
    { version: 1, runtime_proof: undefined }, { runtime_proof: undefined }, { runtime_proof: null },
    { runtime_proof: {} }, { phase: 'archive-qualified' }, { phase: 'exported' }, { phase: 'preparing' },
    { sha: 'f'.repeat(40) }, { ci_run_id: '124' }, { image_id: 'sha256:' + 'f'.repeat(64) },
    { archive_sha256: image }, { archive_bytes: 1 }, { manifest_sha256: image }, { daemon_id: 'TEST:extra' },
  ];
  for (const change of changes) await fixture(async (_root, directory) => {
    const path = join(directory, 'phases.json');
    const value = A.object(A.parseJson(await readFile(path)));
    await writeFile(path, JSON.stringify({ ...value, ...change }));
    await assert.rejects(O.validateCandidate(directory, authority), JSON.stringify(change));
  });
});

test('filesystem runtime proofs deny contradictory bindings and incomplete or malformed smoke evidence', async () => {
  const changes: Record<string, unknown>[] = [
    { schema: 'unknown-runtime-proof' }, { sha: 'f'.repeat(40) },
    { ci_run_id: '124' }, { image_id: 'sha256:' + 'f'.repeat(64) },
    { archive_sha256: image }, { manifest_sha256: image },
    { daemon_id: 'TEST daemon' }, { daemon_id: 'TEST/daemon' },
    { daemon_id: 'short' }, { daemon_id: 'T'.repeat(129) },
    { postgres_major: 17 },
    { postgres_system_identifier: '0' }, { postgres_system_identifier: '18446744073709551616' },
    { postgres_system_identifier: '7688442011877063482' },
    { api_container_id: 'TEST:invalid-container' },
    { api_started_at: 'not-a-date' }, { api_started_at: '0001-01-01T00:00:00Z' },
    { history_sha256: digest(Buffer.from('[]')) },
    { postgres_pool_ok: false }, { cleanup_verified: false },
    { postgres_pool_ok: undefined }, { cleanup_verified: undefined }, { daemon_id: undefined },
    { unexpected: true },
  ];
  for (const change of changes) await fixture(async (_root, directory) => {
    const path = join(directory, 'phases.json');
    const phases = A.object(A.parseJson(await readFile(path)));
    const proof = A.object(phases.runtime_proof);
    await writeFile(path,
      JSON.stringify({ ...phases, runtime_proof: { ...proof, ...change } }));
    await assert.rejects(O.validateCandidate(directory, authority), JSON.stringify(change));
  });
});

test('strict filesystem JSON parsing rejects duplicate phase and runtime proof keys', async () => {
  for (const scope of ['phase', 'proof']) {
    await fixture(async (_root, directory) => {
      const path = join(directory, 'phases.json');
      const raw = await readFile(path, 'utf8');
      const duplicate = scope === 'phase' ? raw.replace('"version":2', '"version":2,"version":2')
        : raw.replace('"cleanup_verified":true', '"cleanup_verified":true,"cleanup_verified":true');
      assert.notEqual(duplicate, raw);
      await writeFile(path, duplicate);
      await assert.rejects(O.validateCandidate(directory, authority));
    });
  }
});

test('valid version 2 proof accepts a historical ephemeral CI daemon identity', async () => {
  await fixture(async (_root, directory) => {
    const path = join(directory, 'phases.json');
    const phases = A.object(A.parseJson(await readFile(path)));
    const proof = A.object(phases.runtime_proof);
    proof.daemon_id = 'TEST:another-ephemeral-ci-daemon';
    await writeFile(path, JSON.stringify(phases));
    const accepted = await O.validateCandidate(directory, authority);
    assert.equal(accepted.value.sha, sha);
  });
});

test('genuine stdlib ZIP yields six exact files; archive bytes remain opaque data', async () => {
  await fixture(async (root, directory, bytes) => {
    const target = join(root, 'transport.zip'), extracted = join(root, 'extracted');
    zip(directory, target); await mkdir(extracted, { mode: 0o700 });
    const transport = await O.checksum(target, 65536);
    assert.equal(transport.digest, digest(await readFile(target)));
    assert.equal(transport.bytes, (await lstat(target)).size);
    await O.extractArtifact(target, extracted);
    assert.deepEqual((await readdir(extracted)).sort(), [...files].sort());
    const accepted = await O.validateCandidate(extracted, authority);
    assert.equal(accepted.manifestHash, digest(await readFile(join(directory, 'manifest.json'))));
    assert.deepEqual(await readFile(accepted.archive), bytes);
    assert.equal((await lstat(accepted.archive)).mode & 0o777, 0o400);
    assert.equal((await lstat(accepted.manifest)).mode & 0o777, 0o400);
  });
});

test('extra, traversal, symlink, duplicate, corrupt CRC and truncated ZIPs terminate with denial', async () => {
  for (const mode of ['extra', 'traversal', 'symlink', 'duplicate', 'crc', 'truncated']) {
    await fixture(async (root, directory, archive) => {
      const target = join(root, 'transport.zip'), extracted = join(root, 'extracted');
      zip(directory, target, mode); await mkdir(extracted, { mode: 0o700 });
      if (mode === 'crc' || mode === 'truncated') {
        const bytes = await readFile(target);
        if (mode === 'crc') {
          const offset = bytes.indexOf(archive); assert.ok(offset >= 0); bytes[offset] = bytes[offset]! ^ 1;
          await writeFile(target, bytes);
        } else await writeFile(target, bytes.subarray(0, bytes.length - 12));
      }
      await assert.rejects(O.extractArtifact(target, extracted), /artifact-zip/);
      assert.equal((await readdir(root)).includes('manifest.json'), false);
    });
  }
});

test('manifest/run/SHA, qualified phase, independent sidecars and archive hash/length must agree', async () => {
  const changes: ((directory: string) => Promise<void>)[] = [
    async directory => { await writeFile(join(directory, 'source-sha.txt'), sha); },
    async directory => { await writeFile(join(directory, 'image-id.txt'), 'latest\n'); },
    async directory => { await writeFile(join(directory, 'candidate.tar.sha256'), 'bad\n'); },
    async directory => { await writeFile(join(directory, 'candidate.tar'), 'different bytes'); },
    async directory => { await writeFile(join(directory, 'build-image.txt'), 'extra'); },
    ...[{ ci_run_id: '124' }, { sha: 'f'.repeat(40) }, { archive_bytes: 1 },
      { archive_sha256: image }, { host: 'untrusted.invalid' }].map(change => async (directory: string) => {
      const value = A.object(A.parseJson(await readFile(join(directory, 'manifest.json'))));
      await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...value, ...change }));
    }),
    ...[{ phase: 'exported' }, { manifest_sha256: image }, { ci_run_id: '124' },
      { archive_bytes: 1 }].map(change => async (directory: string) => {
      const value = A.object(A.parseJson(await readFile(join(directory, 'phases.json'))));
      await writeFile(join(directory, 'phases.json'), JSON.stringify({ ...value, ...change }));
    }),
  ];
  for (const change of changes) await fixture(async (_root, directory) => {
    await change(directory); await assert.rejects(O.validateCandidate(directory, authority));
  });
});

test('real private directory and file guards reject public modes, links, empty and oversized inputs', async () => {
  let cleaned = '';
  await fixture(async (root, directory, bytes) => {
    cleaned = root;
    const scratch = join(root, 'hetzner-private-fixture');
    await mkdir(scratch, { mode: 0o700 });
    assert.equal(await O.privateScratch(root, scratch), scratch);
    await chmod(scratch, 0o755); await assert.rejects(O.privateScratch(root, scratch));
    await chmod(scratch, 0o700); await writeFile(join(scratch, 'extra'), 'x');
    await assert.rejects(O.privateScratch(root, scratch));
    const link = join(root, 'linked'); await symlink(directory, link);
    await assert.rejects(O.canonical(join(link, 'manifest.json')), /private-symlink/);
    const file = join(directory, 'candidate.tar');
    assert.deepEqual(await O.boundedBytes(file, bytes.length), bytes);
    await assert.rejects(O.boundedBytes(file, bytes.length - 1), /file-bounds/);
    await assert.rejects(O.checksum(directory, 65536), /file-bounds/);
    await rm(file); await symlink(join(directory, 'manifest.json'), file);
    await assert.rejects(O.checksum(file, 65536), /private-symlink/);
    const empty = join(root, 'empty.zip'); await writeFile(empty, '');
    const destination = join(root, 'empty-data'); await mkdir(destination, { mode: 0o700 });
    await assert.rejects(O.extractArtifact(empty, destination), /artifact-zip-bounds/);
    await assert.rejects(O.boundedBytes(empty, 65536), /file-bounds/);
  });
  await assert.rejects(lstat(cleaned), { code: 'ENOENT' });
});

const observation = { environment: 'production-hetzner',
  machine_id: 'b28fc7b17042414386eb9b114046e50c', latch: false,
  snapshot: image, api_image: image, compose: image };
const response = (value: unknown, code = 0) => ({ code, stdout: Buffer.from(JSON.stringify(value)) });
function schemaHistoryEvidence() {
  return { history: { rows: Array.from({ length: 300 }, (_, i) => ({ id: `TEST-migration-${i}`,
    migration_name: `TEST-synthetic-migration-${i}`, checksum: 'd'.repeat(64),
    started_at: '2026-01-01T00:00:00.000Z', finished_at: '2026-01-01T00:00:01.000Z',
    rolled_back_at: null, applied_steps_count: 1, logs: null })) } };
}

test('native finite status/preflight schemas are accepted; hostile machine/environment/latch deny', async () => {
  const calls: string[] = [];
  const transport: Transport = async wire => {
    calls.push(wire);
    return response(wire === 'status' ? { environment: 'production-hetzner', latch: false } : observation);
  };
  assert.deepEqual(await O.observeReadonly(transport), observation);
  assert.deepEqual(calls, ['status', 'preflight']);
  for (const change of [{ latch: undefined }, { latch: true }, { machine_id: 'wrong' },
    { environment: 'staging' }, { snapshot: 'latest' }, { extra: true }]) {
    await assert.rejects(O.observeReadonly(async wire => wire === 'status'
      ? response({ environment: 'production-hetzner', latch: false })
      : response({ ...observation, ...change })));
  }
  for (const status of [{ environment: 'production-hetzner' }, { environment: 'staging', latch: false }])
    await assert.rejects(O.observeReadonly(async () => response(status)));
  let retries = 0;
  await assert.rejects(O.observeReadonly(async () => { retries++; return response({}, 255); }));
  assert.equal(retries, 3);
  retries = 0;
  await assert.rejects(O.observeReadonly(async () => {
    retries++; return { ...response({}, 255), diagnostic: 'publickey' as const };
  }), /ssh-publickey/u);
  assert.equal(retries, 3);
  retries = 0;
  await assert.rejects(O.observeReadonly(async () => { retries++; return response({}, 1); }));
  assert.equal(retries, 1);
});

test('preflight receipts accept only fixed diagnostic codes', () => {
  assert.equal(O.safePreflightDiagnostic('preflight', new ClientError('ssh-publickey')), 'ssh-publickey');
  assert.equal(O.safePreflightDiagnostic('activate', new ClientError('ssh-publickey')), undefined);
  assert.equal(O.safePreflightDiagnostic('preflight', new ClientError('PRIVATE_SECRET')), undefined);
  assert.equal(O.safePreflightDiagnostic('preflight', new Error('ssh-publickey')), undefined);
});

test('GitHub credentials and lease stay on stdin; exact cleanup needs no token', async () => {
  const token = 'TEST_ONLY_NOT_A_CREDENTIAL_0000', lease = 'b'.repeat(32);
  const calls: string[] = [];
  const transport: Transport = async (wire, source) => {
    calls.push(wire);
    assert.equal(wire.includes(token), false); assert.equal(wire.includes(lease), false);
    assert.ok(source);
    const chunks: Buffer[] = [];
    for await (const chunk of source()) chunks.push(Buffer.from(chunk));
    const body = A.parseJson(Buffer.concat(chunks));
    const clear = wire.startsWith('github-auth-clear ');
    assert.deepEqual(body, clear ? { lease } : { lease, token });
    return response({ sha, ci_run_id: run, ...(clear ? { cleared: false } : { configured: true }) });
  };
  await O.githubAuth(transport, sha, run, lease, token);
  await O.githubAuth(transport, sha, run, lease);
  assert.deepEqual(calls, [`github-auth ${sha} ${run}`, `github-auth-clear ${sha} ${run}`]);
  await assert.rejects(O.githubAuth(transport, sha, run, lease, token + '\nInjected: header'));
  assert.equal(calls.length, 2);
  await assert.rejects(O.githubAuth(async () => response({ sha: 'e'.repeat(40), ci_run_id: run, configured: true }),
    sha, run, lease, token), /github-auth-binding/u);
  let denied = 0;
  await assert.rejects(O.githubAuth(async () => { denied++; return response({}, 1); }, sha, run, lease, token));
  assert.equal(denied, 1);
  await assert.rejects(O.cohortRecoveryTransport(sha, run, transport)(`github-auth ${sha} ${run}`, async function* () {}));
});

test('cleanup CLI without a retained lease needs no GitHub token, event or SSH secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'TEST-sm-auth-cleanup-'));
  const directory = join(root, 'hetzner-private-test');
  try {
    await mkdir(directory, { mode: 0o700 });
    const env = { PATH: '/usr/bin:/bin', GITHUB_JOB: 'activate', RUNNER_TEMP: root,
      HETZNER_PRIVATE_DIRECTORY: directory, EXPECTED_SHA: sha, EXPECTED_RUN: run };
    await O.main(['auth-clear'], env);
    assert.deepEqual(await readdir(directory), []);
    await assert.rejects(O.main(['auth-clear'], { ...env, GITHUB_JOB: 'preflight' }), /github-auth-job/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native disabled CLI exits before event, GitHub, private directory or credential reads', () => {
  for (const mode of ['', 'unknown']) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types',
      'scripts/ci/hetzner-release-observe.mts', 'activate'],
    { cwd: resolve('.'), env: { PATH: '/usr/bin:/bin', HETZNER_RELEASE_MODE: mode,
      GITHUB_EVENT_PATH: '/nonexistent', HETZNER_PRIVATE_DIRECTORY: '/nonexistent' },
      timeout: 10000, maxBuffer: 65536 });
    assert.ifError(result.error); assert.equal(result.status, 0);
    assert.deepEqual(A.parseJson(result.stdout), { phase: 'disabled-skipped', lane: 'skip' });
    assert.equal(result.stderr.toString().includes('"phase":"failed"'), false);
  }
});

test('native ineligible CLI skips every lane without GitHub token or SSH configuration and cleans scratch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sm-release-ineligible-'));
  const eventPath = join(root, 'event.json'), output = join(root, 'output'), summary = join(root, 'summary');
  try {
    for (const change of [{ event: 'pull_request' }, { conclusion: 'failure' },
      { conclusion: 'cancelled' }, { head_branch: 'feature' }, { event: undefined },
      { head_branch: undefined }, { conclusion: undefined }]) {
      await writeFile(eventPath, JSON.stringify({ repository: { full_name: A.REPOSITORY },
        action: 'completed', workflow_run: { id: 'invalid', event: 'push',
          head_branch: 'main', conclusion: 'success', ...change } }));
      for (const action of ['candidate', 'gate', 'preflight', 'activate']) {
        await writeFile(output, ''); await writeFile(summary, '');
        const job = action === 'gate' ? 'candidate' : action;
        const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', HETZNER_RELEASE_MODE: 'auto',
          RUNNER_TEMP: root, GITHUB_JOB: job, GH_CONFIG_DIR: join(root, `hetzner-gh-${job}`),
          GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: 'workflow_run',
          GITHUB_REPOSITORY: A.REPOSITORY, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
        assert.equal(env.GH_TOKEN, undefined);
        assert.equal(env.HETZNER_PRIVATE_KEY, undefined);
        assert.equal(env.HETZNER_HOST, undefined);
        assert.throws(() => A.githubGet(env),
          (error: unknown) => error instanceof A.AuthorityError && error.code === 'github-token-missing');
        const result = spawnSync(process.execPath, ['--experimental-strip-types',
          'scripts/ci/hetzner-release-observe.mts', action],
        { cwd: resolve('.'), env, timeout: 10000, maxBuffer: 65536 });
        assert.ifError(result.error); assert.equal(result.status, 0, result.stderr.toString());
        assert.deepEqual(A.parseJson(result.stdout), { phase: 'ineligible-skipped', lane: 'skip' });
        assert.equal(result.stderr.toString().includes('"phase":"failed"'), false);
        assert.equal(await readFile(output, 'utf8'), 'phase=ineligible-skipped\nlane=skip\n');
        assert.equal(await readFile(summary, 'utf8'), 'Hetzner release: ineligible-skipped; phase skip.\n');
        assert.deepEqual((await readdir(root)).sort(), ['event.json', 'output', 'summary']);
        await assert.rejects(lstat(env.GH_CONFIG_DIR as string), { code: 'ENOENT' });
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
  await assert.rejects(lstat(root), { code: 'ENOENT' });
});

test('guarded writes bind candidates and allow only recovery of an attempted backend activation', async () => {
  let transported = 0, artifactId = 51, mainSha = sha, includeFrontend = false;
  const transport: Transport = async () => { transported++; return response({}); };
  const repo = { id: 10, name: 'social-monitor', full_name: '777genius/social-monitor',
    owner: { id: 20, login: '777genius' } };
  const get: Get = async path => {
    if (path === '') return repo;
    if (path === 'actions/workflows/pull-request.yml') return { id: 30,
      name: 'Pull request checks', path: '.github/workflows/pull-request.yml', state: 'active' };
    if (path === 'actions/runs/123') return { id: 123, workflow_id: 30, name: 'Pull request checks',
      path: '.github/workflows/pull-request.yml', status: 'completed', conclusion: 'success',
      event: 'push', head_branch: 'main', head_sha: sha, run_attempt: 2, repository: repo, head_repository: repo };
    if (path === 'git/ref/heads/main') return { ref: 'refs/heads/main', object: { type: 'commit', sha: mainSha } };
    if (path === 'actions/workflows/production-deploy.yml') return { id: 40,
      path: '.github/workflows/production-deploy.yml', state: 'disabled_manually' };
    if (path.includes('/jobs?')) return { total_count: A.JOBS.length, jobs: A.JOBS.map((name, i) =>
      ({ id: 1000 + i, run_id: 123, run_attempt: 2, head_sha: sha, status: 'completed', conclusion: 'success', name })) };
    if (path.includes('/artifacts?')) {
      const producer = { id: 123, head_sha: sha, head_branch: 'main', repository_id: 10, head_repository_id: 10 };
      const artifacts = [{ id: artifactId, name: authority.artifactName, expired: false,
        size_in_bytes: 4096, digest: image, workflow_run: producer }];
      if (includeFrontend) artifacts.push({ id: 51, name: `frontend-candidate-${sha}-${run}-2`,
        expired: false, size_in_bytes: 1024, digest: image, workflow_run: producer });
      return { total_count: artifacts.length, artifacts };
    }
    throw new Error('unexpected fixture endpoint');
  };
  const currentAuthority = { ...authority, jobs: A.JOBS.map((_, i) => String(1000 + i)).sort() };
  const guarded = O.guardedTransport(get, currentAuthority, transport);
  for (const wire of [`receive ${sha} ${run} ${image} ${image} 7`, `admit ${sha} ${run}`, `activate ${sha} ${run}`,
    `backend-receive ${sha} ${run} ${image} ${image} 7`, `backend-admit ${sha} ${run}`, `backend-activate ${sha} ${run}`])
    await assert.rejects(guarded(wire), /authority-changed/);
  await assert.rejects(guarded(`rollback ${sha} ${run}`), /rollback-unsupported/);
  await assert.rejects(guarded(`backend-rollback ${sha} ${run}`), /rollback-unsupported/);
  assert.equal(transported, 0);
  await assert.rejects(guarded(`backend-activate ${'c'.repeat(40)} ${run}`), /candidate-disagreement/);
  artifactId = 50;
  await guarded(`backend-activate ${sha} ${run}`);
  mainSha = 'c'.repeat(40);
  await assert.rejects(guarded(`backend-activate ${sha} ${run}`), /stale-main-skip/);
  await assert.rejects(guarded(`backend-rollback ${'c'.repeat(40)} ${run}`), /rollback-unsupported/);
  await guarded(`backend-rollback ${sha} ${run}`);
  await guarded('status'); assert.equal(transported, 3);
  mainSha = sha; includeFrontend = true;
  const source = async function* () { yield Buffer.from('synthetic'); };
  await assert.rejects(guarded(`cohort-receive-frontend ${sha} ${run}`, source), /frontend-authority-required/);
  const frontend = await A.observeFrontendAuthority(get, currentAuthority);
  const guardedFrontend = O.guardedTransport(get, currentAuthority, transport, frontend);
  await guardedFrontend(`cohort-receive-frontend ${sha} ${run}`, source);
  assert.equal(transported, 4);
  await assert.rejects(guardedFrontend(`cohort-rollback ${sha} ${run}`), /rollback-unsupported/);
  await guardedFrontend(`cohort-admit ${sha} ${run}`);
  await guardedFrontend(`cohort-activate ${sha} ${run}`);
  mainSha = 'c'.repeat(40);
  await assert.rejects(guardedFrontend(`cohort-activate ${sha} ${run}`), /frontend-stale-main/);
  await guardedFrontend(`cohort-rollback ${sha} ${run}`);
  mainSha = sha; includeFrontend = false;
  await assert.rejects(guardedFrontend(`cohort-receive-frontend ${sha} ${run}`, source));
  assert.equal(transported, 7);
});

test('restarted runner can only inspect or roll back the bound backend transaction', async () => {
  const sent: string[] = [];
  const recovery = O.recoveryTransport(sha, run, async wire => { sent.push(wire); return response({}); });
  await recovery('status');
  await recovery(`backend-receipt ${sha}-${run}`);
  await recovery(`backend-receipt ${sha}-${run}-rollback`);
  await recovery(`backend-rollback ${sha} ${run}`);
  for (const wire of [`backend-activate ${sha} ${run}`, `backend-admit ${sha} ${run}`,
    `backend-rollback ${'c'.repeat(40)} ${run}`, `backend-receipt ${sha}-124`, `rollback ${sha} ${run}`]) {
    await assert.rejects(recovery(wire), /recovery-scope/);
  }
  await assert.rejects(recovery(`backend-rollback ${sha} ${run}`, async function* () { yield Buffer.from('x'); }), /recovery-scope/);
  assert.equal(sent.length, 4);
});

test('backend recovery trigger requires the repository owner and exact manual rollback identity', () => {
  const event = { repository: { full_name: A.REPOSITORY },
    inputs: { action: 'recover-backend', ci_run_id: run, rollback_sha: sha } };
  const call = (mode: string, payload: unknown, name: string, actor: string, repo: string, ref: string) =>
    O.recoveryTrigger(mode, payload, name, actor, repo, ref);
  assert.deepEqual(call('manual', event, 'workflow_dispatch', '777genius', A.REPOSITORY, 'refs/heads/main'), { sha, run });
  const cohortEvent = { ...event, inputs: { ...event.inputs, action: 'recover-cohort' } };
  assert.deepEqual(O.recoveryTrigger('manual', cohortEvent, 'workflow_dispatch', '777genius',
    A.REPOSITORY, 'refs/heads/main', 'recover-cohort'), { sha, run });
  assert.throws(() => call('manual', cohortEvent, 'workflow_dispatch', '777genius', A.REPOSITORY, 'refs/heads/main'));
  for (const args of [
    ['preflight', event, 'workflow_dispatch', '777genius', A.REPOSITORY, 'refs/heads/main'],
    ['manual', event, 'workflow_run', '777genius', A.REPOSITORY, 'refs/heads/main'],
    ['manual', event, 'workflow_dispatch', 'attacker', A.REPOSITORY, 'refs/heads/main'],
    ['manual', event, 'workflow_dispatch', '777genius', A.REPOSITORY, 'refs/heads/other'],
    ['manual', { ...event, inputs: { ...event.inputs, rollback_sha: 'bad' } }, 'workflow_dispatch', '777genius', A.REPOSITORY, 'refs/heads/main'],
    ['manual', { ...event, inputs: { ...event.inputs, action: 'activate' } }, 'workflow_dispatch', '777genius', A.REPOSITORY, 'refs/heads/main'],
  ] as const) assert.throws(() => call(args[0], args[1], args[2], args[3], args[4], args[5]));
});

test('backend recovery resumes only bound rollback until a matching terminal receipt', async () => {
  const common = { sha, ci_run_id: run, scope: ['api', 'jev-intelligence-worker'], archive_sha256: image, image_id: image,
    previous_image_ids: { api: image, 'jev-intelligence-worker': image },
    active_image_ids: { api: image, 'jev-intelligence-worker': image },
    previous_revisions: { api: sha, 'jev-intelligence-worker': sha },
    target_container_ids: { api: 'c'.repeat(64), 'jev-intelligence-worker': 'd'.repeat(64) },
    runtime_sha256: { api: image, 'jev-intelligence-worker': image }, snapshot_sha256: image, compose_hash: image,
    compatibility: { valid: true }, database: { valid: true }, backup: { valid: true },
    timings: { started_at_ns: 100, finished_at_ns: 101 } };
  let calls = 0, waits = 0;
  const transport: Transport = async wire => {
    assert.equal(wire, `backend-rollback ${sha} ${run}`);
    return response(calls++ ? { ...common, schema: 'social-monitor-backend-release-receipt-v1', outcome: 'rolled-back' }
      : { ...common, phase: 'draining' });
  };
  const receipt = await O.recoverBackend(transport, sha, run, async () => { waits++; });
  assert.equal(receipt.outcome, 'rolled-back'); assert.equal(calls, 2); assert.equal(waits, 1);
  for (const invalid of [
    { sha, ci_run_id: run, scope: common.scope, schema: 'social-monitor-backend-release-receipt-v1', outcome: 'rolled-back' },
    { ...common, schema: 'social-monitor-backend-release-receipt-v1', outcome: 'rolled-back', phase: 'draining' },
    { ...common, active_image_ids: { api: 'sha256:' + 'e'.repeat(64), 'jev-intelligence-worker': image },
      schema: 'social-monitor-backend-release-receipt-v1', outcome: 'rolled-back' },
    { ...common, sha: 'c'.repeat(40), phase: 'draining' },
    { ...common, phase: 'activated' },
    { ...common, schema: 'social-monitor-backend-release-receipt-v1', outcome: 'activated' },
  ]) await assert.rejects(O.recoverBackend(async () => response(invalid), sha, run, async () => {}));
  await assert.rejects(O.recoverBackend(async () => response({ ...common, phase: 'starting' }), sha, run, async () => {}), /recovery-timeout/);
});

test('recovery CLI rejects untrusted dispatch before accessing host credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'TEST-sm-recovery-cli-'));
  try {
    const path = join(root, 'event.json');
    await writeFile(path, JSON.stringify({ repository: { full_name: A.REPOSITORY },
      inputs: { action: 'recover-backend', ci_run_id: run, rollback_sha: sha } }));
    const env = { GITHUB_JOB: 'recover', GITHUB_EVENT_PATH: path, HETZNER_RELEASE_MODE: 'manual',
      GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: 'attacker', GITHUB_REPOSITORY: A.REPOSITORY,
      GITHUB_REF: 'refs/heads/main', RUNNER_TEMP: root, TRUSTED_MAIN: sha };
    await assert.rejects(O.main(['recover'], env), /recovery-trigger/);
    assert.deepEqual(await readdir(root), ['event.json']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('frontend delivery sends exact CI ZIP and checks host proof against both archives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'TEST-sm-frontend-delivery-'));
  try {
    const zipBytes = Buffer.from('synthetic ZIP bytes'), tarHash = 'c'.repeat(64);
    const transportPath = join(root, 'frontend-transport.zip'), manifest = join(root, 'frontend-manifest.json');
    const manifestBytes = Buffer.from(JSON.stringify({ archive: { sha256: tarHash, bytes: 17 } }));
    await writeFile(transportPath, zipBytes); await writeFile(manifest, manifestBytes);
    const base = { ...authority, jobs: A.JOBS.map((_, i) => String(1000 + i)).sort() };
    const frontend = { base, artifact: { id: '51', name: `frontend-candidate-${sha}-${run}-2`,
      digest: digest(zipBytes), bytes: zipBytes.length } };
    const candidate = { manifest, manifestHash: digest(manifestBytes), transport: transportPath };
    const proof = { root: `/var/lib/social-monitor-release/cohort/frontend/candidates/${sha}-${run}/bundle`,
      authority: { sha, ci_run_id: run, ci_run_attempt: '2', artifact_id: '51',
        artifact_name: frontend.artifact.name, artifact_sha256: frontend.artifact.digest, artifact_bytes: zipBytes.length },
      manifest_sha256: candidate.manifestHash, archive_sha256: 'sha256:' + tarHash,
      archive_bytes: 17, tree_sha256: image };
    const repo = { id: 10, name: 'social-monitor', full_name: '777genius/social-monitor',
      owner: { id: 20, login: '777genius' } };
    let currentMain = sha;
    const get: Get = async path => {
      if (path === '') return repo;
      if (path === 'actions/workflows/pull-request.yml') return { id: 30, name: 'Pull request checks',
        path: '.github/workflows/pull-request.yml', state: 'active' };
      if (path === 'actions/runs/123') return { id: 123, workflow_id: 30, name: 'Pull request checks',
        path: '.github/workflows/pull-request.yml', status: 'completed', conclusion: 'success', event: 'push',
        head_branch: 'main', head_sha: sha, run_attempt: 2, repository: repo, head_repository: repo };
      if (path === 'git/ref/heads/main') return { ref: 'refs/heads/main', object: { type: 'commit', sha: currentMain } };
      if (path === 'actions/workflows/production-deploy.yml') return { id: 40,
        path: '.github/workflows/production-deploy.yml', state: 'disabled_manually' };
      if (path.includes('/jobs?')) return { total_count: A.JOBS.length, jobs: A.JOBS.map((name, i) =>
        ({ id: 1000 + i, run_id: 123, run_attempt: 2, head_sha: sha, status: 'completed', conclusion: 'success', name })) };
      if (path.includes('/artifacts?')) {
        const producer = { id: 123, head_sha: sha, head_branch: 'main', repository_id: 10, head_repository_id: 10 };
        return { total_count: 2, artifacts: [
          { id: 50, name: authority.artifactName, expired: false, size_in_bytes: 4096, digest: image, workflow_run: producer },
          { id: 51, name: frontend.artifact.name, expired: false, size_in_bytes: zipBytes.length,
            digest: frontend.artifact.digest, workflow_run: producer }] };
      }
      throw new Error('unexpected endpoint');
    };
    let calls = 0;
    const transport: Transport = async (wire, source) => {
      calls++; assert.equal(wire, `cohort-receive-frontend ${sha} ${run}`); assert.ok(source);
      const chunks: Buffer[] = [];
      for await (const chunk of source()) chunks.push(Buffer.from(chunk));
      assert.deepEqual(Buffer.concat(chunks), zipBytes);
      return response(proof);
    };
    assert.deepEqual(await O.sendFrontendCandidate(frontend, candidate, get, transport), proof);
    assert.deepEqual(await O.sendFrontendCandidate(frontend, candidate, get, async (wire, source) => {
      assert.equal(wire, `cohort-receive-frontend-auth ${sha} ${run}`); assert.ok(source);
      const chunks: Buffer[] = [];
      for await (const chunk of source()) chunks.push(Buffer.from(chunk));
      assert.deepEqual(Buffer.concat(chunks), zipBytes);
      return response(proof);
    }, true), proof);
    const backendManifest = { sha, ci_run_id: run, archive_sha256: digest(zipBytes), image_id: image,
      archive_bytes: zipBytes.length, migrations: ['synthetic'], image_graph: {} };
    const backendBytes = Buffer.from(JSON.stringify(backendManifest));
    const backendManifestPath = join(root, 'backend-manifest.json');
    await writeFile(backendManifestPath, backendBytes);
    const backend = { manifest: backendManifestPath, manifestHash: digest(backendBytes),
      archive: transportPath, value: backendManifest };
    const sentBackend: Transport = async (wire, source) => {
      assert.equal(wire, `cohort-receive-backend ${sha} ${run} ${digest(zipBytes)} ${image} ${zipBytes.length}`);
      assert.ok(source); const chunks: Buffer[] = [];
      for await (const chunk of source()) chunks.push(Buffer.from(chunk));
      assert.deepEqual(Buffer.concat(chunks), zipBytes); return response(backendManifest);
    };
    assert.deepEqual(await O.sendBackendCandidate(base, backend, get, sentBackend), backendManifest);
    await assert.rejects(O.sendBackendCandidate(base, backend, get,
      async () => response({ ...backendManifest, image_id: 'sha256:' + 'f'.repeat(64) })), /backend-host-binding/);
    const targets = ['api', 'jev-intelligence-worker', 'frontend'];
    const previous = Object.fromEntries(targets.map((name, index) => [name, 'sha256:' + String(index + 1).repeat(64)]));
    const active = { ...previous, api: image, 'jev-intelligence-worker': image };
    const ids = Object.fromEntries(targets.map((name, index) => [name, String(index + 4).repeat(64)]));
    const runtime = Object.fromEntries(targets.map(name => [name, image]));
    const oldSources = { '/usr/share/nginx/public': '/trusted/old/public', '/usr/share/nginx/admin': '/trusted/old/admin',
      '/run/bootstrap/verify-static-release.sh': '/trusted/old/check.sh' };
    const desired = { '/usr/share/nginx/public': `${proof.root}/public`, '/usr/share/nginx/admin': `${proof.root}/admin`,
      '/run/bootstrap/verify-static-release.sh': `/var/lib/social-monitor-release/cohort/verifiers/${sha}-${run}.sh` };
    const revisions = { api: sha, 'jev-intelligence-worker': sha };
    const admission = { ...backendManifest, frontend: proof, previous_image_ids: previous, previous_revisions: revisions,
      previous_sources: oldSources, desired_sources: desired, desired_verifier_sha256: image,
      runtime_sha256: runtime, snapshot_sha256: image, compose_hash: image, compatibility: { ok: true }, database: schemaHistoryEvidence() };
    const receipt = { schema: 'social-monitor-cohort-release-receipt-v1', sha, ci_run_id: run,
      archive_sha256: backendManifest.archive_sha256, image_id: image, scope: targets, frontend: proof,
      active_image_ids: active, previous_image_ids: previous, previous_revisions: revisions, target_container_ids: ids,
      active_sources: desired, previous_sources: oldSources, active_releases: { public: sha, admin: sha },
      active_frontend_tree_sha256: image, verifier_sha256: image, runtime_sha256: runtime,
      snapshot_sha256: image, compose_hash: image, compatibility: { ok: true }, database: schemaHistoryEvidence(), backup: { ok: true },
      outcome: 'activated', timings: { started_at_ns: 100, finished_at_ns: 101 } };
    assert.ok(response(admission).stdout.length > 65536 && response(receipt).stdout.length > 65536);
    let polls = 0;
    const cohortTransport: Transport = async wire => {
      if (wire.startsWith('cohort-admit ')) return response(admission);
      if (wire.startsWith('cohort-activate ')) return response(polls++ ? receipt :
        { sha, ci_run_id: run, archive_sha256: backendManifest.archive_sha256, image_id: image, scope: targets, phase: 'starting' });
      if (wire.startsWith('cohort-verify ')) return response({ verified: true, scope: targets, sha, ci_run_id: run,
        archive_sha256: backendManifest.archive_sha256, image_id: image });
      if (wire.startsWith('cohort-receipt ')) return response(receipt);
      throw new Error('unexpected cohort request');
    };
    const steps: string[] = [];
    assert.deepEqual(await O.activateCohort(frontend, backendManifest, proof, get, cohortTransport,
      async () => {}, step => { steps.push(step); }), receipt);
    assert.deepEqual(steps, ['cohort-admit', 'cohort-activate', 'cohort-activate', 'cohort-verify', 'cohort-receipt']);
    assert.equal(polls, 2);
    const oversizedCalls: string[] = [];
    await assert.rejects(O.activateCohort(frontend, backendManifest, proof, get, async wire => {
      oversizedCalls.push(wire); return { code: 0, stdout: Buffer.alloc(2 * 1024 * 1024 + 1, ' ') };
    }, async () => {}), /json-size/);
    assert.deepEqual(oversizedCalls, [`cohort-admit ${sha} ${run}`]);
    let unexpectedCalls = 0;
    await assert.rejects(O.activateCohort(frontend, backendManifest,
      { ...proof, authority: { ...proof.authority, artifact_id: '52' } }, get,
      async () => { unexpectedCalls++; return response({}); }, async () => {}), /cohort-frontend-authority-binding/);
    assert.equal(unexpectedCalls, 0);
    let unstartedRollbacks = 0;
    const unstarted: Transport = async wire => {
      if (wire.startsWith('cohort-admit ')) return response(admission);
      if (wire.startsWith('cohort-activate ')) return response({ denied: 'cohort-target-drift' }, 1);
      assert.equal(wire, `cohort-rollback ${sha} ${run}`); unstartedRollbacks++;
      return response({ denied: 'cohort-rollback-unstarted' }, 1);
    };
    await assert.rejects(O.activateCohort(frontend, backendManifest, proof, get, unstarted, async () => {}),
      (error: unknown) => error instanceof A.AuthorityError && error.code === 'cohort-unstarted');
    assert.equal(unstartedRollbacks, 1);
    for (const mode of ['uncertain', 'progress', 'malformed', 'extra', 'ssh', 'recovery-failed']) {
      let activations = 0, recoveries = 0;
      const cannotProveUnstarted: Transport = async wire => {
        if (wire.startsWith('cohort-admit ')) return response(admission);
        if (wire.startsWith('cohort-activate ')) {
          if (mode === 'uncertain') throw new ClientError('transport-uncertain');
          if (mode === 'progress' && activations++ === 0) return response({ sha, ci_run_id: run,
            archive_sha256: backendManifest.archive_sha256, image_id: image, scope: targets, phase: 'draining' });
          if (mode === 'malformed') return { code: 1, stdout: Buffer.from('not JSON') };
          if (mode === 'extra') return response({ denied: 'cohort-target-drift', unexpected: true }, 1);
          return response({ denied: 'cohort-target-drift' }, mode === 'ssh' ? 255 : 1);
        }
        assert.equal(wire, `cohort-rollback ${sha} ${run}`); recoveries++;
        return response({ denied: mode === 'recovery-failed' ? 'cohort-runtime-changed'
          : 'cohort-rollback-unstarted' }, 1);
      };
      await assert.rejects(O.activateCohort(frontend, backendManifest, proof, get, cannotProveUnstarted, async () => {}),
        (error: unknown) => error instanceof A.AuthorityError && error.code === 'cohort-recovery-required', mode);
      assert.equal(recoveries, 1, mode);
    }
    let rollbacks = 0;
    const rolledBack = { ...receipt, active_image_ids: previous, active_sources: oldSources, outcome: 'rolled-back' };
    let notReadyPolls = 0, timeoutRollbacks = 0;
    const neverReady: Transport = async wire => {
      if (wire.startsWith('cohort-admit ')) return response(admission);
      if (wire.startsWith('cohort-activate ')) {
        notReadyPolls++;
        return response({ sha, ci_run_id: run, archive_sha256: backendManifest.archive_sha256,
          image_id: image, scope: targets, phase: 'starting' });
      }
      assert.equal(wire, `cohort-rollback ${sha} ${run}`); timeoutRollbacks++;
      return response(rolledBack);
    };
    await assert.rejects(O.activateCohort(frontend, backendManifest, proof, get, neverReady, async () => {}),
      (error: unknown) => error instanceof A.AuthorityError && error.code === 'cohort-rolled-back');
    assert.equal(notReadyPolls, 120); assert.equal(timeoutRollbacks, 1);

    const interrupted: Transport = async wire => {
      if (wire.startsWith('cohort-admit ')) return response(admission);
      if (wire.startsWith('cohort-activate ')) {
        currentMain = 'd'.repeat(40);
        return response({ sha, ci_run_id: run, archive_sha256: backendManifest.archive_sha256,
          image_id: image, scope: targets, phase: 'draining' });
      }
      if (wire.startsWith('cohort-rollback ')) { rollbacks++; return response(rolledBack); }
      throw new Error('unexpected cohort request');
    };
    await assert.rejects(O.activateCohort(frontend, backendManifest, proof, get, interrupted, async () => {}),
      /cohort-rolled-back/);
    assert.equal(rollbacks, 1);
    currentMain = sha;
    await assert.rejects(O.sendFrontendCandidate(frontend, candidate, get, async () => response({ ...proof,
      archive_sha256: image })), /frontend-host-binding/);
    currentMain = 'd'.repeat(40);
    await assert.rejects(O.sendFrontendCandidate(frontend, candidate, get, transport), /frontend-stale-main/);
    currentMain = sha;
    await writeFile(transportPath, Buffer.alloc(zipBytes.length, 'x'));
    await assert.rejects(O.sendFrontendCandidate(frontend, candidate, get, transport), /frontend-transport-changed/);
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cohort recovery is bounded to one transaction and validates a complete rollback receipt', async () => {
  const targets = ['api', 'jev-intelligence-worker', 'frontend'];
  const previous = Object.fromEntries(targets.map((name, index) => [name, 'sha256:' + String(index + 1).repeat(64)]));
  const ids = Object.fromEntries(targets.map((name, index) => [name, String(index + 4).repeat(64)]));
  const runtime = Object.fromEntries(targets.map(name => [name, image]));
  const sources = { '/usr/share/nginx/public': '/trusted/old/public', '/usr/share/nginx/admin': '/trusted/old/admin',
    '/run/bootstrap/verify-static-release.sh': '/trusted/old/check.sh' };
  const frontend = { root: `/var/lib/social-monitor-release/cohort/frontend/candidates/${sha}-${run}/bundle`,
    authority: { sha, ci_run_id: run, ci_run_attempt: '2', artifact_id: '51',
      artifact_name: `frontend-candidate-${sha}-${run}-2`, artifact_sha256: image, artifact_bytes: 100 },
    manifest_sha256: image, archive_sha256: image, archive_bytes: 50, tree_sha256: image };
  const receipt = { schema: 'social-monitor-cohort-release-receipt-v1', sha, ci_run_id: run,
    archive_sha256: image, image_id: image, scope: targets, frontend, active_image_ids: previous,
    previous_image_ids: previous, previous_revisions: { api: sha, 'jev-intelligence-worker': sha },
    target_container_ids: ids, active_sources: sources, previous_sources: sources,
    active_releases: { public: sha, admin: sha }, active_frontend_tree_sha256: image, verifier_sha256: image,
    runtime_sha256: runtime, snapshot_sha256: image, compose_hash: image,
    compatibility: { ok: true }, database: schemaHistoryEvidence(), backup: { ok: true }, outcome: 'rolled-back',
    timings: { started_at_ns: 100, finished_at_ns: 101 } };
  let calls = 0;
  const transport: Transport = async wire => {
    assert.equal(wire, `cohort-rollback ${sha} ${run}`);
    return response(calls++ ? receipt : { sha, ci_run_id: run, scope: targets, phase: 'draining' });
  };
  assert.deepEqual(await O.recoverCohort(transport, sha, run, async () => {}), receipt);
  assert.equal(calls, 2);
  const recoveryBytes = response(receipt).stdout;
  assert.ok(recoveryBytes.length > 65536 && recoveryBytes.length < 2 * 1024 * 1024);
  const atLimit = Buffer.concat([recoveryBytes, Buffer.alloc(2 * 1024 * 1024 - recoveryBytes.length, ' ')]);
  assert.deepEqual(await O.recoverCohort(async () => ({ code: 0, stdout: atLimit }), sha, run), receipt);
  await assert.rejects(O.recoverCohort(async () => ({ code: 0, stdout: Buffer.concat([atLimit, Buffer.from(' ')]) }),
    sha, run), /json-size/);
  await assert.rejects(O.recoverCohort(async () => response({ denied: 'cohort-rollback-unstarted' }, 1),
    sha, run, async () => {}),
  (error: unknown) => error instanceof A.AuthorityError && error.code === 'cohort-rollback-unstarted');
  for (const denied of [response({ denied: 'cohort-rollback-unstarted' }),
    response({ denied: 'cohort-rollback-unstarted' }, 255),
    response({ denied: 'cohort-rollback-unstarted', unexpected: true }, 1)]) {
    await assert.rejects(O.recoverCohort(async () => denied, sha, run, async () => {}),
      (error: unknown) => error instanceof A.AuthorityError && error.code !== 'cohort-rollback-unstarted');
  }
  const scoped = O.cohortRecoveryTransport(sha, run, transport);
  await assert.rejects(scoped(`cohort-activate ${sha} ${run}`), /recovery-scope/);
  await assert.rejects(scoped(`cohort-rollback ${'f'.repeat(40)} ${run}`), /recovery-scope/);
  for (const changed of [
    { ...receipt, active_sources: { ...sources, '/usr/share/nginx/public': '/other' } },
    { ...receipt, active_image_ids: { ...previous, frontend: image } },
    { ...receipt, scope: ['api'] }, { ...receipt, phase: 'draining' },
    { ...receipt, frontend: { ...frontend, authority: { ...frontend.authority, ci_run_id: '124' } } },
  ]) assert.throws(() => O.cohortReceipt(changed, sha, run, 'rolled-back'));
  await assert.rejects(O.recoverCohort(async () => response({ sha, ci_run_id: run, scope: targets, phase: 'starting' }),
    sha, run, async () => {}), /cohort-recovery-timeout/);
});


test('failed receipts expose only fixed steps and typed whitelisted diagnostic codes', () => {
  assert.deepEqual(O.safeReleaseFailure('github-auth', new A.AuthorityError('github-observation-timeout')),
    { step: 'github-auth', diagnostic: 'github-observation-timeout' });
  assert.deepEqual(O.safeReleaseFailure('cohort-admit', new ClientError('ssh-publickey')),
    { step: 'cohort-admit', diagnostic: 'ssh-publickey' });
  assert.deepEqual(O.safeReleaseFailure('cohort-admit', new A.AuthorityError('json-size')),
    { step: 'cohort-admit', diagnostic: 'json-size' });
  for (const error of [new Error('github-observation-timeout'),
    new A.AuthorityError('TEST_ONLY_NOT_A_CREDENTIAL_0000'),
    new ClientError('lease=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    { code: 'ssh-publickey', stderr: 'TEST_ONLY_PRIVATE_PAYLOAD' }]) {
    assert.deepEqual(O.safeReleaseFailure('frontend-receive', error),
      { step: 'frontend-receive', diagnostic: 'unknown' });
  }
  assert.deepEqual(O.safeReleaseFailure('TEST_ONLY_PRIVATE_PAYLOAD', new Error('TEST_ONLY_PRIVATE_PAYLOAD')),
    { step: 'unknown', diagnostic: 'unknown' });
});

test('auth diagnostics retain only fixed host/SSH denials and never raw payloads', async () => {
  const lease = 'b'.repeat(32), token = 'TEST_ONLY_NOT_A_CREDENTIAL_0000';
  const cases = [
    [response({ denied: 'busy' }, 1), 'host-busy'],
    [{ ...response({}, 255), diagnostic: 'publickey' as const }, 'ssh-publickey'],
    [response({ denied: token }, 1), 'github-auth-denied'],
    [response({ denied: 'busy', payload: token }, 1), 'github-auth-denied'],
    [{ code: 1, stdout: Buffer.from(token) }, 'github-auth-denied'],
  ] as const;
  for (const [result, expected] of cases)
    await assert.rejects(O.githubAuth(async () => result, sha, run, lease, token),
      (error: unknown) => error instanceof Error && error.message === expected);
});


test('main persists the safe GitHub timeout diagnostic in its existing failed receipt', async t => {
  const root = await mkdtemp(join(tmpdir(), 'TEST-sm-release-diagnostic-'));
  const eventPath = join(root, 'event.json'), token = 'TEST_ONLY_NOT_A_CREDENTIAL_0000';
  const childProcess = require('node:child_process') as typeof import('node:child_process');
  let started: () => void = () => {};
  const spawned = new Promise<void>(resolve => { started = resolve; });
  const child = new EventEmitter() as ReturnType<typeof spawn>, output = new PassThrough();
  Object.assign(child, { stdout: output, kill: () => { output.end(); child.emit('close', null); return true; } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(childProcess, 'spawn', () => { started(); return child; });
  syncBuiltinESMExports();
  try {
    await writeFile(eventPath, JSON.stringify({ repository: { full_name: A.REPOSITORY },
      inputs: { action: 'activate', ci_run_id: run } }));
    const pending = assert.rejects(O.main(['activate'], { HETZNER_RELEASE_MODE: 'manual',
      GITHUB_JOB: 'activate', RUNNER_TEMP: root, GH_CONFIG_DIR: join(root, 'hetzner-gh-activate'),
      GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: '777genius',
      GITHUB_REPOSITORY: A.REPOSITORY, GITHUB_REF: 'refs/heads/main', GH_TOKEN: token }), /release-phase-failed/);
    await spawned; t.mock.timers.tick(60000); await pending;
    const bytes = await readFile(join(root, 'hetzner-receipts-activate', 'receipt.jsonl'), 'utf8');
    assert.deepEqual(bytes.trim().split('\n').map(line => JSON.parse(line)), [
      { phase: 'started', lane: 'activate' },
      { phase: 'failed', lane: 'activate', step: 'authority', diagnostic: 'github-observation-timeout' },
    ]);
    assert.equal(bytes.includes(token), false);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await rm(root, { recursive: true, force: true });
  }
});


test('auth accepts bounded printable ASCII tokens including punctuation and maximum JSON escapes', async () => {
  const lease = 'c'.repeat(32);
  for (const token of ['TEST_ONLY_NOT_A_CREDENTIAL_0000', 'TEST_ONLY.synthetic-token-0000',
    'x'.repeat(20), 'x'.repeat(2048), Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33)).join(''), '"\\'.repeat(1024)]) {
    await O.githubAuth(async (wire, source) => {
      assert.equal(wire.includes(token), false); assert.ok(source);
      const chunks: Buffer[] = [];
      for await (const chunk of source()) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      assert.ok(bytes.length <= 8192);
      if (token === '"\\'.repeat(1024)) assert.ok(bytes.length > 4096);
      assert.deepEqual(A.parseJson(bytes, 8192), { lease, token });
      return response({ sha, ci_run_id: run, configured: true });
    }, sha, run, lease, token);
  }
});

test('auth rejects trailing CR/LF, whitespace, controls, non-ASCII and invalid lengths before transport', async () => {
  const token = 'TEST_ONLY_NOT_A_CREDENTIAL_0000'; let calls = 0;
  for (const invalid of [token + ' ', token + '\n', token + '\r', token + '\r\n', token + '\t',
    token + '\x00', token + '\x1f', token + '\x7f', token + 'é', 'x'.repeat(19), 'x'.repeat(2049)]) {
    await assert.rejects(O.githubAuth(async () => { calls++; return response({}); }, sha, run, 'c'.repeat(32), invalid),
      (error: unknown) => error instanceof A.AuthorityError && error.code === 'github-auth-token');
  }
  assert.equal(calls, 0);
});
