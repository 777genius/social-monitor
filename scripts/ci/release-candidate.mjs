#!/usr/bin/env node
// Candidate producer and disposable runtime qualifier; no deployment or tag writes.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { directory as trustedDirectory } from './candidate-runtime-contract.mts';

export const SHA = /^[0-9a-f]{40}$/;
export const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const RUN = /^[1-9][0-9]{0,14}$/;
const MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const CONFIG = 'application/vnd.oci.image.config.v1+json';
const LAYER = 'application/vnd.oci.image.layer.v1.tar';
const JSON_LIMIT = 4_000_000;
const ARCHIVE_LIMIT = 10_000_000_000;

function requireValue(ok, reason) {
  if (!ok) throw new Error(reason);
}
function exact(value, keys, reason) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(','), reason);
}
function descriptor(value, media) {
  requireValue(value && Object.keys(value).every(k =>
    ['mediaType', 'digest', 'size', 'platform', 'annotations'].includes(k)), 'descriptor-fields');
  requireValue(media.includes(value.mediaType) && typeof value.digest === 'string' && DIGEST.test(value.digest)
    && Number.isSafeInteger(value.size) && value.size > 0 && value.size <= 2 ** 31,
  'descriptor-identity');
  if (value.platform !== undefined) {
    exact(value.platform, ['os', 'architecture'], 'descriptor-platform');
    requireValue(value.platform.os === 'linux' && value.platform.architecture === 'amd64', 'descriptor-platform');
  }
  if (value.annotations !== undefined) {
    requireValue(value.annotations && typeof value.annotations === 'object'
      && !Array.isArray(value.annotations) && Object.keys(value.annotations).length <= 16
      && Object.entries(value.annotations).every(([k, v]) => k.length <= 256
        && typeof v === 'string' && v.length <= 4096), 'descriptor-annotations');
    requireValue(!value.annotations['org.opencontainers.image.ref.name']
      && value.annotations['vnd.docker.reference.type'] !== 'attestation-manifest', 'descriptor-tag-or-attestation');
  }
}

// Exactly Controller.receive's import object. Controller v1 does not put a
// version field in this object; local phase receipts are separately versioned.
export function validateManifest(value) {
  exact(value, ['sha', 'ci_run_id', 'archive_sha256', 'image_id', 'archive_bytes',
    'migrations', 'image_graph'], 'manifest-fields');
  requireValue(typeof value.sha === 'string' && SHA.test(value.sha), 'source-sha');
  requireValue(typeof value.ci_run_id === 'string' && RUN.test(value.ci_run_id), 'ci-run-id');
  requireValue(typeof value.archive_sha256 === 'string' && DIGEST.test(value.archive_sha256)
    && typeof value.image_id === 'string' && DIGEST.test(value.image_id), 'manifest-digest');
  requireValue(Number.isSafeInteger(value.archive_bytes) && value.archive_bytes > 0
    && value.archive_bytes <= ARCHIVE_LIMIT, 'archive-bytes');
  const graph = value.image_graph;
  exact(graph, ['kind', 'root_digest', 'descriptor', 'config_digest', 'config', 'layers', 'diff_ids'], 'graph-fields');
  requireValue(graph.kind === 'oci-manifest' && graph.root_digest === value.image_id
    && typeof graph.config_digest === 'string' && DIGEST.test(graph.config_digest) && graph.config_digest !== value.image_id, 'native-manifest-identity');
  descriptor(graph.descriptor, [MANIFEST]);
  descriptor(graph.config, [CONFIG]);
  requireValue(graph.descriptor.digest === value.image_id
    && graph.config.digest === graph.config_digest, 'graph-binding');
  requireValue(Array.isArray(graph.layers) && graph.layers.length > 0 && graph.layers.length <= 128
    && Array.isArray(graph.diff_ids) && graph.diff_ids.length === graph.layers.length
    && graph.diff_ids.every(d => typeof d === 'string' && DIGEST.test(d)), 'graph-layers');
  graph.layers.forEach(d => descriptor(d, [LAYER, LAYER + '+gzip']));
  requireValue(Array.isArray(value.migrations) && value.migrations.length > 0
    && value.migrations.length <= 10_000, 'migration-inventory');
  let previous = '';
  for (const item of value.migrations) {
    exact(item, ['name', 'checksum'], 'migration-fields');
    requireValue(typeof item.name === 'string' && /^[0-9]{14}_[a-z0-9_]+$/.test(item.name)
      && item.name.length <= 256 && item.name > previous
      && typeof item.checksum === 'string' && /^[0-9a-f]{64}$/.test(item.checksum), 'migration-inventory');
    previous = item.name;
  }
  requireValue(Buffer.byteLength(JSON.stringify(value)) <= JSON_LIMIT, 'manifest-size');
  return value;
}

export function validateRuntimeProof(value, binding, manifest) {
  exact(value, ['schema', 'sha', 'ci_run_id', 'image_id', 'archive_sha256',
    'manifest_sha256', 'daemon_id', 'postgres_system_identifier', 'postgres_major',
    'api_container_id', 'api_started_at', 'history_sha256', 'postgres_pool_ok',
    'cleanup_verified'], 'runtime-proof-fields');
  requireValue(value.schema === 'social-monitor-candidate-runtime-v1', 'runtime-proof-schema');
  for (const key of ['sha', 'ci_run_id', 'image_id', 'archive_sha256',
    'manifest_sha256', 'daemon_id']) {
    requireValue(typeof value[key] === 'string' && value[key] === binding[key],
      'runtime-proof-binding');
  }
  requireValue(SHA.test(value.sha) && RUN.test(value.ci_run_id)
    && [value.image_id, value.archive_sha256, value.manifest_sha256,
      value.history_sha256].every(d => DIGEST.test(d)), 'runtime-proof-digest');
  requireValue(value.daemon_id.length > 0 && value.daemon_id.length <= 128
    && !Array.from(value.daemon_id).some(c => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127), 'runtime-proof-daemon');
  requireValue(typeof value.postgres_system_identifier === 'string'
    && /^[1-9][0-9]{0,19}$/.test(value.postgres_system_identifier)
    && BigInt(value.postgres_system_identifier) <= 18446744073709551615n
    && value.postgres_system_identifier !== '7688442011877063482'
    && value.postgres_major === 18, 'runtime-proof-postgres');
  requireValue(typeof value.api_container_id === 'string'
    && /^[0-9a-f]{64}$/.test(value.api_container_id)
    && typeof value.api_started_at === 'string' && value.api_started_at.length <= 64
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value.api_started_at)
    && !value.api_started_at.startsWith('0001-')
    && Number.isFinite(Date.parse(value.api_started_at)), 'runtime-proof-api');
  const history = manifest.migrations.map(({ name, checksum }) => ({ checksum, name }));
  requireValue(value.history_sha256 === 'sha256:' + createHash('sha256')
    .update(JSON.stringify(history)).digest('hex'), 'runtime-proof-history');
  requireValue(value.postgres_pool_ok === true && value.cleanup_verified === true,
    'runtime-proof-incomplete');
  return value;
}

export async function regular(file, limit) {
  const info = await lstat(file);
  requireValue(info.isFile() && info.size > 0 && info.size <= limit
    && !(info.mode & 0o022), 'regular-file-size');
  return info;
}
export async function readJson(file) {
  await regular(file, JSON_LIMIT);
  return JSON.parse(await readFile(file, 'utf8'));
}
export async function checksum(file, limit = ARCHIVE_LIMIT) {
  const before = await regular(file, limit);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file, { flags: 'r' })) {
    bytes += chunk.length;
    requireValue(bytes <= limit, 'archive-bytes');
    hash.update(chunk);
  }
  const after = await regular(file, limit);
  requireValue(before.ino === after.ino && before.dev === after.dev && before.size === bytes
    && after.size === bytes && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
  'file-changed');
  return { sha256: 'sha256:' + hash.digest('hex'), bytes };
}
export async function atomic(file, value) {
  const bytes = typeof value === 'string' ? value : JSON.stringify(value) + '\n';
  requireValue(Buffer.byteLength(bytes) <= JSON_LIMIT, 'output-size');
  const pending = file + '.pending';
  // This filename is exclusively owned by the locked candidate directory.
  await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const handle = await open(pending, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(pending, file);
  const directory = await open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

// Bounded argv-only process seam. The test seam proves orchestration policy,
// while the independent Python archive validator proves real artifact content.
export async function command(program, args, { cwd, output, input, limit = JSON_LIMIT,
  timeout = 150_000, inherit = false, inheritStderr = false } = {}) {
  const handle = output ? await open(output, 'wx', 0o600) : null;
  const child = spawn(program, args, { cwd, shell: false,
    stdio: [input ? 'pipe' : 'ignore', 'pipe',
      inherit || inheritStderr ? 'inherit' : 'ignore'] });
  let inputError;
  const inputStream = input ? createReadStream(input) : null;
  if (inputStream) {
    inputStream.on('error', error => { inputError = error; child.kill('SIGKILL'); });
    child.stdin.on('error', error => { inputError = error; child.kill('SIGKILL'); });
    inputStream.pipe(child.stdin);
  }
  const chunks = [];
  let size = 0;
  const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('command-failed:' + program)));
  });
  // Observe early process errors even while draining stdout.
  completed.catch(() => {});
  try {
    for await (const chunk of child.stdout) {
      size += chunk.length;
      requireValue(size <= limit, 'command-output-limit');
      if (handle) await handle.writeFile(chunk);
      else if (inherit) process.stderr.write(chunk);
      else chunks.push(chunk);
    }
    await completed;
    if (inputError) throw inputError;
    if (handle) await handle.sync();
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    child.kill('SIGKILL');
    await completed.catch(() => {});
    // Keep bounded stdout available to the disposable SSH verifier. Callers
    // log only message; transport failures cannot masquerade as policy denials.
    error.exitCode = child.exitCode;
    if (!inherit && !output) error.stdout = Buffer.concat(chunks).toString('utf8');
    throw error;
  } finally {
    clearTimeout(timer);
    inputStream?.destroy();
    if (handle) await handle.close();
  }
}

async function source(options, run) {
  const sha = (await run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: options.cwd })).trim();
  requireValue(SHA.test(sha) && sha === options.sha, 'checkout-source-mismatch');
  requireValue(!(await run('git', ['status', '--porcelain', '--untracked-files=normal'],
    { cwd: options.cwd })).trim(), 'dirty-checkout');
  if (process.env.GITHUB_SHA) requireValue(process.env.GITHUB_SHA === sha, 'ci-checkout-mismatch');
  if (process.env.GITHUB_RUN_ID) requireValue(process.env.GITHUB_RUN_ID === options.runId, 'ci-run-mismatch');
  return sha;
}
async function image(options, id, run) {
  requireValue(DIGEST.test(id), 'image-id');
  const result = JSON.parse(await run('docker', ['image', 'inspect', id], { cwd: options.cwd }));
  requireValue(Array.isArray(result) && result.length === 1, 'image-inspect');
  const item = result[0];
  requireValue(item.Id === id && item.Os === 'linux' && item.Architecture === 'amd64'
    && item.Config?.Labels?.['org.opencontainers.image.revision'] === options.sha
    && item.Config?.Labels?.['social-monitor.ci-run-id'] === options.runId, 'image-identity-mismatch');
  requireValue(item.RootFS?.Type === 'layers' && Array.isArray(item.RootFS.Layers)
    && item.RootFS.Layers.length > 0 && item.RootFS.Layers.every(d => typeof d === 'string' && DIGEST.test(d)), 'unknown-image-filesystem');
  requireValue(item.Descriptor?.digest === id && item.Descriptor?.mediaType === MANIFEST, 'native-image-descriptor');
  return item;
}
async function nativeDaemon(run) {
  const version = JSON.parse(await run('docker', ['version', '--format', '{{json .Server}}']));
  const info = JSON.parse(await run('docker', ['info', '--format', '{{json .}}']));
  requireValue(/^29\./.test(version.Version) && info.OSType === 'linux'
    && ['x86_64', 'amd64'].includes(info.Architecture)
    && info.DriverStatus?.some(row => row[0] === 'driver-type'
      && row[1] === 'io.containerd.snapshotter.v1'), 'docker29-native-store-required');
  requireValue(typeof info.ID === 'string' && /^[A-Za-z0-9:_-]{8,128}$/.test(info.ID),
    'native-daemon-id');
  return info.ID;
}
async function receipt(file) {
  try { return await readJson(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function safeDirectory(directory, cwd) {
  requireValue(path.isAbsolute(directory) && path.normalize(directory) === directory, 'candidate-path');
  let ancestor = directory;
  while (true) {
    try {
      const info = await lstat(ancestor);
      requireValue(info.isDirectory() && await realpath(ancestor) === ancestor, 'candidate-symlink');
      // Admit the full existing ancestry before mkdir or any producer work.
      // The shared guard permits sticky boundaries as ancestors, not endpoints.
      let boundary = ancestor;
      for (;;) {
        const parent = await lstat(boundary);
        if (!(parent.mode & 0o022) || !(parent.mode & 0o1000)) {
          await trustedDirectory(boundary);
          break;
        }
        requireValue(parent.isDirectory()
          && (parent.uid === 0 || parent.uid === process.geteuid?.())
          && await realpath(boundary) === boundary, 'untrusted-directory');
        const next = path.dirname(boundary);
        requireValue(next !== boundary, 'untrusted-directory');
        boundary = next;
      }
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ancestor = path.dirname(ancestor);
    }
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  requireValue(await realpath(directory) === directory, 'candidate-symlink');
  const protectedDirectory = await lstat(directory);
  requireValue((protectedDirectory.mode & 0o777) === 0o700
    && protectedDirectory.uid === process.getuid?.(), 'candidate-directory-permissions');
  await trustedDirectory(directory, true);
  const sourceRoot = await realpath(cwd);
  requireValue(directory !== sourceRoot && !directory.startsWith(sourceRoot + path.sep), 'candidate-outside-checkout');
  const files = await readdir(directory);
  const owned = ['producer.lock', 'phases.json', 'build-image.txt', 'source.tar', 'candidate.tar',
    'manifest.json', 'candidate.tar.sha256', 'image-id.txt', 'source-sha.txt', 'runtime-private'];
  requireValue(files.length <= 16 && files.every(name => owned.includes(name)
    || owned.some(base => name === base + '.pending')), 'candidate-directory-not-owned');
  requireValue(files.length === 0 || files.includes('phases.json'), 'candidate-directory-not-owned');
}

export async function qualify(options, binding, run = command) {
  const archive = path.join(options.directory, 'candidate.tar');
  const actual = await checksum(archive);
  requireValue(actual.sha256 === binding.archive_sha256 && actual.bytes === binding.archive_bytes,
    'export-identity-mismatch');
  const proof = JSON.parse(await run(options.python || 'python3', ['-I', '-B',
    path.resolve(options.controllerDir, 'archive.py'), archive, actual.sha256,
    binding.image_id, options.sha, options.runId, '/app/prisma/migrations'], { timeout: 150_000 }));
  return validateManifest({ sha: options.sha, ci_run_id: options.runId,
    archive_sha256: actual.sha256, image_id: binding.image_id, archive_bytes: actual.bytes, ...proof });
}

export async function candidate(options, run = command, emit = value => process.stdout.write(JSON.stringify(value) + '\n')) {
  requireValue(SHA.test(options.sha) && RUN.test(options.runId), 'source-or-run');
  options = { ...options, cwd: path.resolve(options.cwd || '.') };
  await safeDirectory(options.directory, options.cwd);
  const lock = path.join(options.directory, 'producer.lock');
  const handle = await open(lock, 'wx', 0o600);
  const phases = path.join(options.directory, 'phases.json');
  const iid = path.join(options.directory, 'build-image.txt');
  try {
    await source(options, run);
    const daemonId = await nativeDaemon(run);
    let state = await receipt(phases);
    if (state) {
      exact(state, ['version', 'sha', 'ci_run_id', 'phase', 'image_id', 'archive_sha256',
        'archive_bytes', 'manifest_sha256', ...(state.version === 2 ? ['runtime_proof'] : [])], 'phase-fields');
      requireValue([1, 2].includes(state.version) && state.sha === options.sha && state.ci_run_id === options.runId
        && ['preparing', 'building', 'built', 'exported', 'qualified',
          ...(state.version === 2 ? ['archive-qualified'] : [])].includes(state.phase), 'resume-identity-mismatch');
      requireValue(['preparing', 'building'].includes(state.phase) ? state.image_id === null
        : typeof state.image_id === 'string' && DIGEST.test(state.image_id), 'resume-image-id');
      requireValue(['archive-qualified', 'qualified'].includes(state.phase) ? typeof state.manifest_sha256 === 'string'
        && DIGEST.test(state.manifest_sha256) : state.manifest_sha256 === null, 'resume-manifest-proof');
      requireValue(['exported', 'archive-qualified', 'qualified'].includes(state.phase)
        ? typeof state.archive_sha256 === 'string' && DIGEST.test(state.archive_sha256)
          && Number.isSafeInteger(state.archive_bytes) && state.archive_bytes > 0
          && state.archive_bytes <= ARCHIVE_LIMIT
        : state.archive_sha256 === null && state.archive_bytes === null, 'resume-archive-proof');
      if (state.version === 2) requireValue(state.phase === 'qualified'
        ? state.runtime_proof && typeof state.runtime_proof === 'object'
        : state.runtime_proof === null, 'resume-runtime-proof');
    } else {
      state = { version: 2, sha: options.sha, ci_run_id: options.runId, phase: 'preparing',
        image_id: null, archive_sha256: null, archive_bytes: null, manifest_sha256: null,
        runtime_proof: null };
      await atomic(phases, state);
      await atomic(path.join(options.directory, 'source-sha.txt'), options.sha + '\n');
      emit(state);
    }
    if (state.phase === 'preparing') {
      const snapshot = path.join(options.directory, 'source.tar');
      const pending = snapshot + '.pending';
      await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error; });
      // Only the committed Git snapshot enters COPY; ignored workspace output
      // cannot alter source or SQL while preserving a clean Git status.
      await run('git', ['archive', '--format=tar', options.sha],
        { cwd: options.cwd, output: pending, limit: 1_000_000_000, timeout: 150_000 });
      await checksum(pending, 1_000_000_000);
      await rename(pending, snapshot);
      await source(options, run);
      state = { ...state, phase: 'building' };
      // Journal before build. No durable IID after interruption is ambiguous;
      // automatic retry is never permission to start another build.
      await atomic(phases, state);
      emit(state);
      await run('docker', ['build', '--file', 'Dockerfile', '--target', 'app',
        '--provenance=false', '--platform', 'linux/amd64', '--iidfile', iid,
        '--label', 'org.opencontainers.image.revision=' + options.sha,
        '--label', 'social-monitor.ci-run-id=' + options.runId, '-'],
      { cwd: options.cwd, input: snapshot, timeout: 1_800_000, limit: 32_000_000, inherit: true });
    }
    if (state.phase === 'building') {
      await regular(iid, 128);
      const id = (await readFile(iid, 'utf8')).trim();
      await source(options, run);
      await image(options, id, run);
      state = { ...state, phase: 'built', image_id: id };
      await atomic(phases, state);
      await atomic(path.join(options.directory, 'image-id.txt'), id + '\n');
      await atomic(path.join(options.directory, 'source-sha.txt'), options.sha + '\n');
      emit(state);
    }
    await unlink(path.join(options.directory, 'source.tar')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await source(options, run);
    const observed = await image(options, state.image_id, run);
    let manifest;
    if (state.phase === 'built') {
      const retained = await readdir(options.directory);
      // A pending save has no durable completion evidence. Preserve its bytes
      // for reconciliation rather than silently starting another export.
      requireValue(!retained.includes('candidate.tar.pending'), 'ambiguous-export');
      if (retained.includes('candidate.tar')) {
        // Archive publication can succeed before the exported journal rename.
        // Reconcile only independently verified bytes bound to this run/image.
        const sum = await checksum(path.join(options.directory, 'candidate.tar'));
        manifest = await qualify(options, { ...state, archive_sha256: sum.sha256,
          archive_bytes: sum.bytes }, run);
        requireValue(JSON.stringify(observed.RootFS.Layers) === JSON.stringify(manifest.image_graph.diff_ids)
          && observed.Descriptor.size === manifest.image_graph.descriptor.size, 'daemon-archive-graph-mismatch');
        state = { ...state, phase: 'exported', archive_sha256: sum.sha256, archive_bytes: sum.bytes };
        await atomic(phases, state);
        emit(state);
      }
    }
    if (state.phase === 'built') {
      const pending = path.join(options.directory, 'candidate.tar.pending');
      await run('docker', ['image', 'save', state.image_id],
        { output: pending, limit: ARCHIVE_LIMIT, timeout: 150_000 });
      const sum = await checksum(pending);
      await rename(pending, path.join(options.directory, 'candidate.tar'));
      state = { ...state, phase: 'exported', archive_sha256: sum.sha256, archive_bytes: sum.bytes };
      await atomic(phases, state);
      emit(state);
    }
    // Upload-only retry verifies exactly the previously proved bytes and identity,
    // without rerunning the completed archive qualification phase.
    const manifestPath = path.join(options.directory, 'manifest.json');
    const completed = state.version === 2 && state.phase === 'qualified';
    if (['archive-qualified', 'qualified'].includes(state.phase)) {
      const archive = await checksum(path.join(options.directory, 'candidate.tar'));
      requireValue(archive.sha256 === state.archive_sha256 && archive.bytes === state.archive_bytes,
        'export-identity-mismatch');
      requireValue((await checksum(manifestPath, JSON_LIMIT)).sha256 === state.manifest_sha256,
        'qualified-manifest-changed');
      manifest = validateManifest(await readJson(manifestPath));
      requireValue(manifest.sha === state.sha && manifest.ci_run_id === state.ci_run_id
        && manifest.image_id === state.image_id && manifest.archive_sha256 === state.archive_sha256
        && manifest.archive_bytes === state.archive_bytes, 'qualified-binding-mismatch');
    } else if (!manifest) manifest = await qualify(options, state, run);
    requireValue(JSON.stringify(observed.RootFS?.Layers) === JSON.stringify(manifest.image_graph.diff_ids)
      && observed.Descriptor.size === manifest.image_graph.descriptor.size, 'daemon-archive-graph-mismatch');
    await source(options, run);
    await image(options, state.image_id, run);
    requireValue(await nativeDaemon(run) === daemonId, 'native-daemon-changed');
    if (completed) {
      validateRuntimeProof(state.runtime_proof, { ...state, daemon_id: daemonId }, manifest);
      emit(state);
      return manifest;
    }
    if (state.phase !== 'archive-qualified') {
      await atomic(manifestPath, manifest);
      await atomic(path.join(options.directory, 'candidate.tar.sha256'), manifest.archive_sha256.slice(7) + '  candidate.tar\n');
      await atomic(path.join(options.directory, 'image-id.txt'), state.image_id + '\n');
      await atomic(path.join(options.directory, 'source-sha.txt'), options.sha + '\n');
      state = { ...state, version: 2, phase: 'archive-qualified',
        manifest_sha256: (await checksum(manifestPath, JSON_LIMIT)).sha256, runtime_proof: null };
      await atomic(phases, state);
      emit(state);
    }
    const runtime = fileURLToPath(new URL('./candidate-runtime.mts', import.meta.url));
    const runtimeProof = validateRuntimeProof(JSON.parse(await run(process.execPath,
      ['--experimental-strip-types', runtime, '--directory', options.directory,
        '--source', options.cwd, '--sha', options.sha, '--run-id', options.runId,
        '--image-id', state.image_id, '--archive-sha256', state.archive_sha256,
        '--manifest-sha256', state.manifest_sha256],
      { cwd: options.cwd, timeout: 1_200_000, limit: 65_536, inheritStderr: true })),
    { ...state, daemon_id: daemonId }, manifest);
    await source(options, run);
    requireValue(await nativeDaemon(run) === daemonId, 'native-daemon-changed');
    const after = await image(options, state.image_id, run);
    requireValue(JSON.stringify(after.RootFS.Layers) === JSON.stringify(manifest.image_graph.diff_ids)
      && after.Descriptor.size === manifest.image_graph.descriptor.size, 'daemon-archive-graph-mismatch');
    const archive = await checksum(path.join(options.directory, 'candidate.tar'));
    requireValue(archive.sha256 === state.archive_sha256 && archive.bytes === state.archive_bytes,
      'export-identity-mismatch');
    requireValue((await checksum(manifestPath, JSON_LIMIT)).sha256 === state.manifest_sha256,
      'qualified-manifest-changed');
    state = { ...state, phase: 'qualified', runtime_proof: runtimeProof };
    await atomic(phases, state);
    emit(state);
    return manifest;
  } finally {
    try { await handle.close(); }
    finally { await unlink(lock); }
  }
}

export function parseArgs(args) {
  const options = {};
  const names = { '--directory': 'directory', '--source-sha': 'sha', '--run-id': 'runId',
    '--controller-dir': 'controllerDir', '--python': 'python', '--cwd': 'cwd' };
  for (let i = 0; i < args.length; i += 2) {
    requireValue(names[args[i]] && args[i + 1] && !args[i + 1].startsWith('--')
      && options[names[args[i]]] === undefined, 'argument');
    options[names[args[i]]] = args[i + 1];
  }
  requireValue(options.directory && options.controllerDir && options.sha && options.runId, 'required-arguments');
  return options;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  candidate(parseArgs(process.argv.slice(2))).catch(error => {
    process.stderr.write('release-candidate: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
