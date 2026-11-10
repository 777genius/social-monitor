import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
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
  includeFrontend = false;
  await assert.rejects(guardedFrontend(`cohort-receive-frontend ${sha} ${run}`, source));
  assert.equal(transported, 4);
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
