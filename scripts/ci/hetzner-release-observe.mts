import { constants as F } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { ClientError, command, deliver, runnerConfig, sshTransport, validateManifest } from './hetzner-release-client.mjs';
import type { Manifest, Transport } from './hetzner-release-client.mjs';
import type { Authority, Get, Trigger } from './hetzner-release-authority.mjs';

// Typed synchronous .mts loading avoids top-level await and permits the unchanged
// CommonJS root compiler as well as the standalone NodeNext compiler to check this.
const A: typeof import('./hetzner-release-authority.mjs') =
  createRequire(resolve('scripts/ci/hetzner-release-observe.mts'))('./hetzner-release-authority.mts');
const MACHINE = 'b28fc7b17042414386eb9b114046e50c';
const FILES = ['candidate.tar', 'candidate.tar.sha256', 'manifest.json', 'phases.json', 'image-id.txt', 'source-sha.txt'];
const LIMIT = 10_000_000_000;
export async function canonical(path: string): Promise<void> {
  A.requireValue(isAbsolute(path) && resolve(path) === path
    && /^\/[a-zA-Z0-9_./-]+$/u.test(path), 'private-path');
  for (let item = path; ; item = dirname(item)) {
    A.requireValue(!(await lstat(item)).isSymbolicLink(), 'private-symlink');
    if (item === dirname(item)) break;
  }
}
export async function privateScratch(root: string, value: unknown): Promise<string> {
  const path = A.text(value, /^\/[a-zA-Z0-9_./-]+$/u, 'private-directory');
  A.requireValue(dirname(path) === root
    && /^hetzner-private-[a-zA-Z0-9]+$/u.test(path.slice(root.length + 1)), 'private-directory');
  await canonical(path);
  const info = await lstat(path);
  A.requireValue(info.isDirectory() && info.uid === process.getuid?.()
    && !(info.mode & 0o077) && (await readdir(path)).length === 0, 'private-directory');
  return path;
}
function identity(info: Awaited<ReturnType<typeof lstat>>): string {
  return [info.dev, info.ino, info.size, info.mode, info.uid, info.gid, info.mtimeMs, info.ctimeMs].join(':');
}
export async function boundedBytes(path: string, limit: number): Promise<Buffer> {
  await canonical(path);
  const handle = await open(path, F.O_RDONLY | F.O_NOFOLLOW | F.O_NONBLOCK);
  try {
    const before = await handle.stat();
    A.requireValue(before.isFile() && before.size > 0 && before.size <= limit, 'file-bounds');
    const storage = Buffer.alloc(before.size + 1); let total = 0;
    while (total < storage.length) {
      const { bytesRead } = await handle.read(storage, total, storage.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    A.requireValue(total === before.size && identity(before) === identity(await handle.stat())
      && identity(before) === identity(await lstat(path)), 'file-changed');
    return storage.subarray(0, total);
  } finally { await handle.close(); }
}
export async function checksum(path: string, limit: number): Promise<{ digest: string; bytes: number }> {
  await canonical(path);
  const handle = await open(path, F.O_RDONLY | F.O_NOFOLLOW | F.O_NONBLOCK);
  try {
    const before = await handle.stat();
    A.requireValue(before.isFile() && before.size > 0 && before.size <= limit, 'file-bounds');
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false, start: 0, end: before.size })) {
      const data = Buffer.from(chunk as Uint8Array);
      bytes += data.length; A.requireValue(bytes <= limit, 'file-bounds'); hash.update(data);
    }
    A.requireValue(bytes === before.size && identity(before) === identity(await handle.stat())
      && identity(before) === identity(await lstat(path)), 'file-changed');
    return { digest: 'sha256:' + hash.digest('hex'), bytes };
  } finally { await handle.close(); }
}
async function download(authority: Authority, target: string, env: NodeJS.ProcessEnv): Promise<void> {
  const file = await open(target, F.O_WRONLY | F.O_CREAT | F.O_EXCL | F.O_NOFOLLOW, 0o600);
  const child = spawn('/usr/bin/gh', ['api', '--hostname', 'github.com', '--method', 'GET',
    '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28',
    `repos/${A.REPOSITORY}/actions/artifacts/${authority.artifact}/zip`],
  { shell: false, env: A.githubEnvironment(env), stdio: ['ignore', 'pipe', 'ignore'] });
  const closed = new Promise<void>((accept, reject) => {
    child.once('error', () => reject(new A.AuthorityError('artifact-download')));
    child.once('close', code => code === 0 ? accept() : reject(new A.AuthorityError('artifact-download')));
  });
  void closed.catch(() => {});
  const timer = setTimeout(() => child.kill('SIGKILL'), 1_200_000);
  const hash = createHash('sha256'); let size = 0;
  try {
    for await (const chunk of child.stdout) {
      const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length;
      A.requireValue(size <= authority.artifactBytes && size <= 10_100_000_000, 'artifact-size');
      hash.update(bytes); await file.writeFile(bytes);
    }
    await closed;
    A.requireValue(size === authority.artifactBytes
      && 'sha256:' + hash.digest('hex') === authority.artifactDigest, 'artifact-hash');
    await file.sync();
  } catch {
    child.kill('SIGKILL'); await closed.catch(() => {});
    throw new A.AuthorityError('artifact-download-failed');
  } finally { clearTimeout(timer); await file.close(); }
}
// Trusted stdlib decodes only the GitHub ZIP. candidate.tar is never extracted.
const ZIP_READER = `
import os, stat, sys, zipfile
names = {'candidate.tar', 'candidate.tar.sha256', 'manifest.json',
         'phases.json', 'image-id.txt', 'source-sha.txt'}
def need(ok):
    if not ok: raise ValueError('transport-zip')
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries = archive.infolist()
    need(len(entries) == 6 and {e.filename for e in entries} == names)
    need(min(e.header_offset for e in entries) == 0)
    need(len({e.header_offset for e in entries}) == 6)
    total = 0
    for entry in entries:
        ceiling = 10000000000 if entry.filename == 'candidate.tar' else 65536
        kind = stat.S_IFMT(entry.external_attr >> 16)
        need(kind in (0, stat.S_IFREG) and not entry.is_dir())
        need(not entry.flag_bits & 1 and entry.compress_type in (0, 8))
        need(entry.orig_filename == entry.filename)
        need(0 < entry.file_size <= ceiling and entry.compress_size >= 0)
        total += entry.file_size
        need(total <= 10000000000 + 5 * 65536)
        fd = os.open(os.path.join(sys.argv[2], entry.filename),
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as output, archive.open(entry, 'r') as source:
            observed = 0
            while True:
                chunk = source.read(65536)
                if not chunk: break
                observed += len(chunk)
                need(observed <= entry.file_size and observed <= ceiling)
                output.write(chunk)
            need(observed == entry.file_size)
            output.flush()
            os.fsync(output.fileno())
`;
export async function extractArtifact(zip: string, directory: string): Promise<void> {
  await canonical(zip); await canonical(directory);
  const input = await lstat(zip), destination = await lstat(directory);
  A.requireValue(input.isFile() && input.size > 0 && input.size <= 10_100_000_000,
    'artifact-zip-bounds');
  A.requireValue(destination.isDirectory() && destination.uid === process.getuid?.()
    && !(destination.mode & 0o077)
    && (await readdir(directory)).length === 0, 'artifact-directory');
  const child = spawn('/usr/bin/python3', ['-I', '-B', '-c', ZIP_READER, zip, directory],
    { shell: false, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, stdio: 'ignore' });
  const timer = setTimeout(() => child.kill('SIGKILL'), 1_200_000);
  try {
    await new Promise<void>((accept, reject) => {
      child.once('error', () => reject(new A.AuthorityError('artifact-zip')));
      child.once('close', code => code === 0 ? accept() : reject(new A.AuthorityError('artifact-zip')));
    });
  } finally { clearTimeout(timer); }
}
export interface Candidate { manifest: string; archive: string; manifestHash: string; value: Manifest }
export async function validateCandidate(directory: string, authority: Authority): Promise<Candidate> {
  await canonical(directory);
  const names = await readdir(directory);
  A.requireValue(names.length === FILES.length && FILES.every(name => names.includes(name)), 'candidate-files');
  const manifest = join(directory, 'manifest.json'), archive = join(directory, 'candidate.tar');
  const bytes = await boundedBytes(manifest, 65536);
  const value = validateManifest(A.parseJson(bytes, 65536), authority.sha, authority.run);
  const manifestHash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const phases = A.exact(A.parseJson(await boundedBytes(join(directory, 'phases.json'), 65536)),
    ['version', 'sha', 'ci_run_id', 'phase', 'image_id', 'archive_sha256', 'archive_bytes', 'manifest_sha256']);
  A.requireValue(phases.version === 1 && phases.phase === 'qualified' && phases.sha === value.sha
    && phases.ci_run_id === value.ci_run_id && phases.image_id === value.image_id
    && phases.archive_sha256 === value.archive_sha256 && phases.archive_bytes === value.archive_bytes
    && phases.manifest_sha256 === manifestHash, 'qualified-manifest-binding');
  const expectedText = [['source-sha.txt', value.sha + '\n'], ['image-id.txt', value.image_id + '\n'],
    ['candidate.tar.sha256', value.archive_sha256.slice(7) + '  candidate.tar\n']] as const;
  for (const [name, expected] of expectedText) {
    A.requireValue((await boundedBytes(join(directory, name), 256)).equals(Buffer.from(expected)), 'candidate-sidecar');
  }
  const actual = await checksum(archive, LIMIT);
  A.requireValue(actual.bytes === value.archive_bytes && actual.digest === value.archive_sha256, 'candidate-archive-binding');
  await chmod(manifest, 0o400); await chmod(archive, 0o400);
  return { manifest, archive, manifestHash, value };
}
async function candidate(authority: Authority, scratch: string, env: NodeJS.ProcessEnv): Promise<Candidate> {
  const zip = join(scratch, 'transport.zip'), directory = join(scratch, 'data');
  await mkdir(directory, { mode: 0o700 }); await download(authority, zip, env);
  await extractArtifact(zip, directory); return validateCandidate(directory, authority);
}
export interface Observation {
  environment: 'production-hetzner'; machine_id: string; latch: false;
  snapshot: string; api_image: string; compose: string;
}
async function readonlyCall(transport: Transport, verb: 'status' | 'preflight'): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await transport(command(verb));
      A.requireValue(Number.isInteger(result.code) && Buffer.isBuffer(result.stdout), 'transport-result');
      if (result.code === 255) throw new ClientError('transport-uncertain');
      A.requireValue(result.code === 0, 'host-denied'); return A.parseJson(result.stdout, 65536);
    } catch (error) {
      if (!(error instanceof ClientError && error.code === 'transport-uncertain' && attempt < 2)) throw error;
    }
  }
  throw new A.AuthorityError('readonly-exhausted');
}
export async function observeReadonly(transport: Transport): Promise<Observation> {
  const status = A.exact(await readonlyCall(transport, 'status'), ['latch', 'environment']);
  A.requireValue(status.environment === 'production-hetzner' && status.latch === false, 'host-status');
  const value = A.exact(await readonlyCall(transport, 'preflight'),
    ['environment', 'machine_id', 'snapshot', 'api_image', 'compose', 'latch']);
  A.requireValue(value.environment === 'production-hetzner' && value.machine_id === MACHINE
    && value.latch === false, 'host-preflight');
  return { environment: 'production-hetzner', machine_id: MACHINE, latch: false,
    snapshot: A.text(value.snapshot, A.DIGEST, 'host-snapshot'),
    api_image: A.text(value.api_image, A.DIGEST, 'host-image'),
    compose: A.text(value.compose, A.DIGEST, 'host-compose') };
}
export function guardedTransport(get: Get, authority: Authority, transport: Transport): Transport {
  return async (wire, source) => {
    const [verb, ...args] = wire.split(' '); A.requireValue(typeof verb === 'string', 'wire');
    command(verb, args);
    A.requireValue(verb !== 'rollback', 'rollback-unsupported');
    if (['receive', 'admit', 'activate'].includes(verb)) {
      const decision = await A.observeAuthority(get, authority.run);
      if (decision.phase === 'stale-main-skipped') throw new ClientError('stale-main-skip');
      A.sameAuthority(authority, decision.authority);
    }
    return transport(wire, source);
  };
}
async function provisionRunner(directory: string, env: NodeJS.ProcessEnv) {
  await canonical(directory);
  A.requireValue((await readdir(directory)).every(name => ['data', 'transport.zip'].includes(name)), 'private-directory');
  const host = A.text(env.HETZNER_HOST, /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/u, 'runner-host');
  const port = Number(A.text(env.HETZNER_PORT, /^[1-9][0-9]{0,4}$/u, 'runner-port'));
  A.requireValue(port <= 65535, 'runner-port');
  for (const key of ['HETZNER_PRIVATE_KEY', 'HETZNER_KNOWN_HOSTS']) {
    const value = env[key];
    A.requireValue(typeof value === 'string' && Buffer.byteLength(value) > 0
      && Buffer.byteLength(value) <= 1024 * 1024, 'runner-secret-bounds');
  }
  const key = join(directory, 'key'), hosts = join(directory, 'known_hosts');
  await writeFile(key, env.HETZNER_PRIVATE_KEY as string, { mode: 0o600, flag: 'wx' });
  await writeFile(hosts, env.HETZNER_KNOWN_HOSTS as string, { mode: 0o600, flag: 'wx' });
  const path = join(directory, 'runner.json');
  await writeFile(path, JSON.stringify({ host, port, user: 'sm-release', private_key: key, known_hosts: hosts }),
    { mode: 0o600, flag: 'wx' });
  return runnerConfig(path);
}
async function append(path: string, value: unknown): Promise<void> {
  await canonical(dirname(path));
  const handle = await open(path, F.O_WRONLY | F.O_CREAT | F.O_APPEND | F.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
}
async function outputs(value: Record<string, string>): Promise<void> {
  for (const [key, item] of Object.entries(value)) {
    A.requireValue(/^[a-z_]{1,32}$/u.test(key) && /^[a-zA-Z0-9_:-]{0,128}$/u.test(item), 'output');
  }
  if (process.env.GITHUB_OUTPUT) {
    const handle = await open(process.env.GITHUB_OUTPUT, F.O_WRONLY | F.O_APPEND | F.O_NOFOLLOW);
    try { await handle.writeFile(Object.entries(value).map(([key, item]) => `${key}=${item}\n`).join('')); }
    finally { await handle.close(); }
  }
  process.stdout.write(JSON.stringify(value) + '\n');
}
function expected(authority: Authority, trigger: Trigger, env: NodeJS.ProcessEnv): string {
  A.requireValue(A.text(env.EXPECTED_SHA, A.SHA, 'expected-sha') === authority.sha
    && A.text(env.EXPECTED_RUN, A.RUN, 'expected-run') === authority.run
    && A.text(env.EXPECTED_ARTIFACT, A.RUN, 'expected-artifact') === authority.artifact
    && env.EXPECTED_LANE === trigger.lane, 'candidate-disagreement');
  return A.text(env.EXPECTED_MANIFEST_HASH, A.DIGEST, 'expected-manifest');
}
async function summary(phase: string, lane: string): Promise<void> {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const handle = await open(process.env.GITHUB_STEP_SUMMARY, F.O_WRONLY | F.O_APPEND | F.O_NOFOLLOW);
  try { await handle.writeFile(`Hetzner release: ${phase}; phase ${lane}.\n`); }
  finally { await handle.close(); }
}
export async function main(args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  A.requireValue(args.length === 1 && ['candidate', 'gate', 'preflight', 'activate'].includes(args[0] ?? ''), 'arguments');
  const action = args[0];
  if (!['preflight', 'manual', 'auto'].includes(env.HETZNER_RELEASE_MODE ?? '')) {
    await outputs({ phase: 'disabled-skipped', lane: 'skip' }); return;
  }
  const root = A.text(env.RUNNER_TEMP, /^\/[a-zA-Z0-9_./-]+$/u, 'runner-temp');
  await canonical(root); A.requireValue((await lstat(root)).isDirectory(), 'runner-temp');
  const job = A.text(env.GITHUB_JOB, /^(?:candidate|preflight|activate)$/u, 'runner-job');
  A.requireValue(env.GH_CONFIG_DIR === join(root, `hetzner-gh-${job}`), 'github-private-config');
  const eventPath = A.text(env.GITHUB_EVENT_PATH, /^\/[a-zA-Z0-9_./-]+$/u, 'event-path');
  const trigger = A.releaseTrigger(env.HETZNER_RELEASE_MODE,
    A.parseJson(await boundedBytes(eventPath, 1024 * 1024), 1024 * 1024),
    env.GITHUB_EVENT_NAME ?? '', env.GITHUB_ACTOR ?? '', env.GITHUB_REPOSITORY ?? '', env.GITHUB_REF ?? '');
  const ghDirectory = env.GH_CONFIG_DIR;
  A.requireValue(typeof ghDirectory === 'string', 'github-private-config');
  await mkdir(ghDirectory, { mode: 0o700 }); await canonical(ghDirectory);
  let scratch: string | undefined, publicDirectory: string | undefined;
  try {
    if (action === 'preflight' || action === 'activate') {
      A.requireValue(trigger.lane === action && job === action, 'host-lane');
      const destination = join(root, `hetzner-receipts-${job}`);
      await mkdir(destination, { mode: 0o700 }); await canonical(destination);
      publicDirectory = destination;
      await append(join(publicDirectory, 'receipt.jsonl'), { phase: 'started', lane: action });
    }
    const get = A.githubGet(env), decision = await A.observeAuthority(get, trigger.run);
    if (decision.phase === 'stale-main-skipped') {
      if (publicDirectory) await append(join(publicDirectory, 'receipt.jsonl'), decision);
      await outputs({ phase: decision.phase, lane: trigger.lane }); await summary(decision.phase, trigger.lane); return;
    }
    const authority = decision.authority;
    A.requireValue(A.text(env.TRUSTED_MAIN, A.SHA, 'trusted-main') === authority.sha, 'checkout-main-disagreement');
    const expectedHash = action === 'candidate' ? undefined : expected(authority, trigger, env);
    if (action === 'gate') { await outputs({ phase: 'ready', lane: trigger.lane }); return; }
    scratch = action === 'candidate' ? await mkdtemp(join(root, 'hetzner-candidate-'))
      : await privateScratch(root, env.HETZNER_PRIVATE_DIRECTORY);
    const data = await candidate(authority, scratch, env);
    A.requireValue(expectedHash === undefined || expectedHash === data.manifestHash, 'manifest-disagreement');
    const repeated = await A.observeAuthority(get, authority.run);
    if (repeated.phase === 'stale-main-skipped') {
      if (publicDirectory) await append(join(publicDirectory, 'receipt.jsonl'), repeated);
      await outputs({ phase: repeated.phase, lane: trigger.lane }); return;
    }
    A.sameAuthority(authority, repeated.authority);
    if (action === 'candidate') {
      await outputs({ phase: 'ready', lane: trigger.lane, sha: authority.sha, run: authority.run,
        artifact: authority.artifact, manifest_hash: data.manifestHash }); return;
    }
    A.requireValue(publicDirectory, 'receipt-directory');
    const config = await provisionRunner(scratch, env), transport = sshTransport(config);
    const binding = { sha: authority.sha, ci_run_id: authority.run, artifact_id: authority.artifact,
      manifest_sha256: data.manifestHash, archive_sha256: data.value.archive_sha256, image_id: data.value.image_id };
    if (action === 'preflight') {
      const observation = await observeReadonly(transport);
      await append(join(publicDirectory, 'receipt.jsonl'), { phase: 'preflight-observed', lane: action, ...binding, ...observation });
      await summary('preflight-observed', action); await outputs({ phase: 'preflight-observed', lane: action }); return;
    }
    const result = await deliver({ manifest: data.manifest, archive: data.archive, sha: authority.sha,
      run: authority.run, phases: join(publicDirectory, 'phases.jsonl') }, guardedTransport(get, authority, transport));
    A.requireValue(['completed', 'stale-main-skipped'].includes(result.phase), 'terminal-phase');
    await append(join(publicDirectory, 'receipt.jsonl'), { phase: result.phase, lane: action, ...binding });
    await summary(result.phase, 'activate'); await outputs({ phase: result.phase, lane: 'activate' });
  } catch {
    if (publicDirectory) {
      await append(join(publicDirectory, 'receipt.jsonl'), { phase: 'failed', lane: action });
      await summary('failed; operator reconciliation required', action ?? 'unknown');
    }
    throw new A.AuthorityError('release-phase-failed');
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
    await rm(ghDirectory, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/ci/hetzner-release-observe.mts')) {
  main(process.argv.slice(2), process.env).catch(() => {
    process.stderr.write('{"phase":"failed"}\n'); process.exitCode = 1;
  });
}
