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
async function fixture(body: (root: string, directory: string, bytes: Buffer) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'sm-release-observe-')), directory = join(root, 'data');
  const bytes = Buffer.from('candidate-data-only; no tar extraction or execution\n');
  const manifest = { sha, ci_run_id: run, archive_sha256: digest(bytes), image_id: image,
    archive_bytes: bytes.length, migrations: [{ name: '20261001000000_initial',
      checksum: createHash('sha256').update('fixture SQL inventory only').digest('hex') }],
    image_graph: { kind: 'oci-manifest', root_digest: image,
      descriptor: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: image, size: 10 },
      config_digest: 'sha256:' + 'c'.repeat(64),
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: 'sha256:' + 'c'.repeat(64), size: 10 },
      layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: 'sha256:' + 'd'.repeat(64), size: 10 }],
      diff_ids: ['sha256:' + 'e'.repeat(64)] } };
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  try {
    await mkdir(directory, { mode: 0o700 });
    const contents: Record<string, Buffer | string> = {
      'candidate.tar': bytes, 'manifest.json': manifestBytes,
      'candidate.tar.sha256': manifest.archive_sha256.slice(7) + '  candidate.tar\n',
      'source-sha.txt': sha + '\n', 'image-id.txt': image + '\n',
      'phases.json': JSON.stringify({ version: 1, sha, ci_run_id: run, phase: 'qualified',
        image_id: image, archive_sha256: manifest.archive_sha256,
        archive_bytes: bytes.length, manifest_sha256: digest(manifestBytes) }) + '\n',
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
  await assert.rejects(O.observeReadonly(async () => { retries++; return response({}, 1); }));
  assert.equal(retries, 1);
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

test('guarded writes reject changed authority before transport; rollback is outside the draft', async () => {
  let transported = 0;
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
    if (path === 'git/ref/heads/main') return { ref: 'refs/heads/main', object: { type: 'commit', sha } };
    if (path === 'actions/workflows/production-deploy.yml') return { id: 40,
      path: '.github/workflows/production-deploy.yml', state: 'disabled_manually' };
    if (path.includes('/jobs?')) return { total_count: 16, jobs: A.JOBS.map((name, i) =>
      ({ id: 1000 + i, run_id: 123, run_attempt: 2, head_sha: sha, status: 'completed', conclusion: 'success', name })) };
    if (path.includes('/artifacts?')) return { total_count: 1, artifacts: [{ id: 51,
      name: authority.artifactName, expired: false, size_in_bytes: 4096, digest: image,
      workflow_run: { id: 123, head_sha: sha, head_branch: 'main', repository_id: 10, head_repository_id: 10 } }] };
    throw new Error('unexpected fixture endpoint');
  };
  const guarded = O.guardedTransport(get, authority, transport);
  for (const wire of [`receive ${sha} ${run} ${image} ${image} 7`, `admit ${sha} ${run}`, `activate ${sha} ${run}`])
    await assert.rejects(guarded(wire), /authority-changed/);
  await assert.rejects(guarded(`rollback ${sha} ${run}`), /rollback-unsupported/);
  assert.equal(transported, 0);
  await guarded('status'); assert.equal(transported, 1);
});
