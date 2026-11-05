import { constants as F } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RUN = /^[1-9][0-9]{0,14}$/u;
const MACHINE = 'b28fc7b17042414386eb9b114046e50c';
const MAX_ARCHIVE = 10_000_000_000;
const ENV = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C' };
export class ClientError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function requireThat(ok, code) { if (!ok) throw new ClientError(code); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) {
  return object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function finiteJson(value, depth = 0) {
  requireThat(depth <= 64, 'json-depth');
  if (typeof value === 'number') requireThat(Number.isFinite(value), 'json-finite');
  else if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) finiteJson(nested, depth + 1);
  }
}
function binding(value, manifest) {
  requireThat(object(value) && ['sha', 'ci_run_id', 'archive_sha256', 'image_id']
    .every((key) => value[key] === manifest[key]), 'response-binding');
}
export function validateManifest(value, sha, run) {
  finiteJson(value);
  requireThat(typeof sha === 'string' && typeof run === 'string' && SHA.test(sha) && RUN.test(run), 'release-identity');
  requireThat(exact(value, ['sha', 'ci_run_id', 'archive_sha256', 'image_id', 'archive_bytes',
    'migrations', 'image_graph'])
    && Array.isArray(value.migrations) && value.migrations.length > 0 && object(value.image_graph)
    && value.sha === sha && value.ci_run_id === run
    && DIGEST.test(value.archive_sha256) && DIGEST.test(value.image_id)
    && Number.isSafeInteger(value.archive_bytes) && value.archive_bytes > 0
    && value.archive_bytes <= MAX_ARCHIVE, 'candidate-manifest');
  return Object.freeze({ ...value });
}
async function canonicalPath(path, trusted = false) {
  requireThat(typeof path === 'string' && isAbsolute(path) && resolve(path) === path, 'file-path');
  for (let item = path; ; item = dirname(item)) {
    const info = await lstat(item);
    requireThat(!info.isSymbolicLink(), 'file-symlink');
    if (trusted) requireThat((info.uid === 0 || info.uid === process.getuid())
      && !(info.mode & 0o022), 'runner-file-trust');
    if (item === dirname(item)) break;
  }
}
async function regular(path, ceiling, trusted = false) {
  await canonicalPath(path, trusted);
  const handle = await open(path, F.O_RDONLY | F.O_NOFOLLOW | F.O_NONBLOCK);
  try {
    const info = await handle.stat();
    requireThat(info.isFile() && info.size > 0 && info.size <= ceiling, 'file-bounds');
    return { handle, info };
  } catch (error) { await handle.close(); throw error; }
}
async function jsonFile(path, trusted = false) {
  const { handle, info } = await regular(path, 65536, trusted);
  try {
    const storage = Buffer.alloc(info.size + 1);
    let total = 0;
    while (total < storage.length) {
      const { bytesRead } = await handle.read(storage, total, storage.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    const bytes = storage.subarray(0, total);
    requireThat(bytes.length === info.size && bytes.length <= 65536
      && sameFile(info, await handle.stat()), 'file-changed');
    const value = parseJson(bytes);
    return value;
  } finally { await handle.close(); }
}
export async function runnerConfig(path) {
  const value = await jsonFile(path, true);
  requireThat(exact(value, ['host', 'port', 'user', 'private_key', 'known_hosts'])
    && typeof value.host === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/u.test(value.host)
    && Number.isInteger(value.port) && value.port > 0 && value.port <= 65535
    && value.user === 'sm-release', 'runner-config');
  for (const key of ['private_key', 'known_hosts']) {
    requireThat(typeof value[key] === 'string' && /^\/[a-zA-Z0-9_./-]+$/u.test(value[key]), 'runner-file-path');
    const { handle, info } = await regular(value[key], 1024 * 1024, true);
    await handle.close();
    requireThat(key !== 'private_key' || !(info.mode & 0o077), 'runner-key-mode');
  }
  return Object.freeze({ ...value });
}
export function command(verb, args = []) {
  const patterns = {
    status: [], preflight: [], receive: [SHA, RUN, DIGEST, DIGEST, /^[1-9][0-9]{0,11}$/u],
    admit: [SHA, RUN], activate: [SHA, RUN], verify: [SHA, RUN], rollback: [SHA, RUN],
    receipt: [/^[0-9a-f]{40}-[1-9][0-9]{0,14}(?:-rollback)?$/u],
  };
  requireThat(Object.hasOwn(patterns, verb) && Array.isArray(args)
    && args.length === patterns[verb].length
    && args.every((arg, i) => typeof arg === 'string' && patterns[verb][i].test(arg)), 'ssh-grammar');
  requireThat(verb !== 'receive' || Number(args[4]) <= MAX_ARCHIVE, 'ssh-grammar');
  return [verb, ...args].join(' ');
}
export function sshArgs(config, wire) {
  // One grammar-only command argument; sshd's forced command never evaluates it.
  const [verb, ...args] = wire.split(' ');
  command(verb, args);
  return ['-F', '/dev/null', '-o', 'StrictHostKeyChecking=yes', '-o',
    `UserKnownHostsFile=${config.known_hosts}`, '-o', 'IdentitiesOnly=yes',
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'GlobalKnownHostsFile=/dev/null',
    '-o', 'ClearAllForwardings=yes', '-o', 'RequestTTY=no', '-o', 'IdentityAgent=none',
    '-p', String(config.port), '-l', config.user, '-i', config.private_key, '--', config.host, wire];
}
export function sshTransport(config, spawnProcess = spawn) {
  return async (wire, source) => {
    const child = spawnProcess('/usr/bin/ssh', sshArgs(config, wire),
      { shell: false, env: ENV, stdio: ['pipe', 'pipe', 'pipe'] });
    let size = 0;
    const chunks = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), 600_000);
    const closed = new Promise((accept, reject) => {
      child.once('error', () => reject(new ClientError('transport-uncertain')));
      child.once('close', (code) => accept(code));
    });
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) child.kill('SIGKILL');
      else chunks.push(chunk);
    });
    // Discard stderr, including possible private paths, remote errors and payloads.
    child.stderr.resume();
    const sent = source ? pipeline(Readable.from(source()), child.stdin) :
      new Promise((accept) => { child.stdin.end(accept); });
    try {
      const [code] = await Promise.all([closed, sent]);
      requireThat(size <= 8 * 1024 * 1024, 'transport-uncertain');
      return { code, stdout: Buffer.concat(chunks) };
    } catch { child.kill('SIGKILL'); await closed.catch(() => {}); throw new ClientError('transport-uncertain'); }
    finally { clearTimeout(timer); }
  };
}
function parseJson(bytes) {
  const source = bytes.toString('utf8');
  requireThat(Buffer.from(source).equals(Buffer.from(bytes)), 'response-malformed');
  const value = JSON.parse(source);
  const stack = [];
  let previous;
  // Tokenize validated JSON solely to reject duplicate keys. Large host nanosecond
  // timestamps cannot be canonicalized through JS doubles to validate wire bytes.
  for (const match of source.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/gu)) {
    const token = match[0];
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? new Set() : null);
      requireThat(stack.length <= 64, 'json-depth');
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ':') {
      const key = JSON.parse(previous);
      const keys = stack.at(-1);
      requireThat(keys && !keys.has(key), 'json-keys');
      keys.add(key);
    }
    previous = token;
  }
  finiteJson(value);
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function decode(result) {
  requireThat(result && Number.isInteger(result.code) && result.stdout?.length <= 8 * 1024 * 1024,
    'transport-uncertain');
  let value;
  try { value = parseJson(result.stdout); } catch {
    throw new ClientError(result.code === 255 ? 'transport-uncertain' : 'response-malformed');
  }
  if (exact(value, ['denied']) && result.code === 1) {
    // Only this independently host-checked reason permits a stale-main skip.
    throw new ClientError(value.denied === 'stale-main-skip' ? 'stale-main-skip' : 'host-denied');
  }
  requireThat(result.code === 0 && object(value) && !Object.hasOwn(value, 'denied'),
    result.code === 255 ? 'transport-uncertain' : 'host-denied');
  return value;
}
function status(value) {
  requireThat(exact(value, ['latch', 'environment']) && value.environment === 'production-hetzner'
    && value.latch === false, 'host-status');
}
function preflight(value) {
  requireThat(exact(value, ['environment', 'machine_id', 'snapshot', 'api_image', 'compose', 'latch'])
    && value.environment === 'production-hetzner' && value.machine_id === MACHINE
    && value.latch === false && DIGEST.test(value.snapshot)
    && DIGEST.test(value.api_image) && DIGEST.test(value.compose), 'host-preflight');
}
export function receipt(value, manifest, admission) {
  finiteJson(value);
  finiteJson(admission);
  binding(value, manifest);
  requireThat(exact(value, ['schema', 'sha', 'ci_run_id', 'archive_sha256', 'image_id',
    'previous_image_id', 'previous_sha', 'image_graph', 'compatibility', 'scope',
    'snapshot_before_hash', 'snapshot_after_hash', 'backup', 'migration_status', 'probes', 'outcome', 'timings'])
    && value.schema === 'social-monitor-release-receipt-v1' && value.outcome === 'activated'
    && value.scope?.length === 1 && value.scope[0] === 'api' && value.migration_status === 'unchanged'
    && value.probes?.target === true && DIGEST.test(value.previous_image_id) && SHA.test(value.previous_sha)
    && DIGEST.test(value.snapshot_before_hash) && value.snapshot_after_hash === value.snapshot_before_hash
    && object(value.image_graph) && object(value.compatibility) && object(value.backup)
    && object(value.timings) && Number.isSafeInteger(value.timings.started_at)
    && Number.isSafeInteger(value.timings.finished_at)
    && value.timings.finished_at >= value.timings.started_at, 'terminal-receipt');
  for (const key of ['previous_image_id', 'previous_sha', 'image_graph', 'compatibility',
    'snapshot_before_hash', 'migration_status']) {
    requireThat(canonical(value[key]) === canonical(admission[key]), 'receipt-admission');
  }
  return value;
}
function sameFile(a, b) {
  return ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'uid', 'gid'].every((key) => a[key] === b[key]);
}
export async function deliver(options, transport) {
  const manifest = validateManifest(await jsonFile(options.manifest), options.sha, options.run);
  const { handle: archive, info } = await regular(options.archive, MAX_ARCHIVE);
  let journal;
  let phase = 'validated';
  try {
    requireThat(info.size === manifest.archive_bytes, 'archive-size');
    const hash = createHash('sha256');
    for await (const bytes of archive.createReadStream({ autoClose: false, start: 0, end: info.size })) hash.update(bytes);
    requireThat(`sha256:${hash.digest('hex')}` === manifest.archive_sha256
      && sameFile(info, await archive.stat()), 'archive-hash');
    await canonicalPath(dirname(options.phases));
    journal = await open(options.phases, F.O_WRONLY | F.O_CREAT | F.O_EXCL | F.O_NOFOLLOW, 0o600);
    const parent = await open(dirname(options.phases), F.O_RDONLY | F.O_DIRECTORY);
    try { await parent.sync(); } finally { await parent.close(); }
    async function observed(next) {
      phase = next;
      await journal.writeFile(JSON.stringify({ phase, sha: manifest.sha, ci_run_id: manifest.ci_run_id,
        archive_sha256: manifest.archive_sha256, image_id: manifest.image_id }) + '\n');
      await journal.sync();
    }
    async function call(verb, args = [], source, readonly = false) {
      for (let attempt = 0; ; attempt++) {
        try { return decode(await transport(command(verb, args), source)); } catch (error) {
          if (!(readonly && attempt < 2 && error.code === 'transport-uncertain')) throw error;
        }
      }
    }
    await observed('validated');
    status(await call('status', [], undefined, true));
    preflight(await call('preflight', [], undefined, true));
    await observed('preflight-observed');
    const pair = [manifest.sha, manifest.ci_run_id];
    let admission;
    try {
      const imported = await call('receive', [...pair, manifest.archive_sha256, manifest.image_id,
        String(manifest.archive_bytes)], () => archive.createReadStream({ autoClose: false, start: 0, end: info.size - 1 }));
      binding(imported, manifest);
      requireThat(imported.archive_bytes === manifest.archive_bytes && sameFile(info, await archive.stat()),
        'import-binding');
      await observed('received');
      admission = await call('admit', pair);
      binding(admission, manifest);
      requireThat(admission.archive_bytes === manifest.archive_bytes
        && DIGEST.test(admission.snapshot_before_hash) && DIGEST.test(admission.compose_hash)
        && DIGEST.test(admission.previous_image_id) && SHA.test(admission.previous_sha)
        && DIGEST.test(admission.database_hash) && object(admission.snapshot_before)
        && object(admission.image_graph) && object(admission.compatibility) && object(admission.backup)
        && admission.migration_status === 'unchanged', 'admission-binding');
      await observed('admitted');
    } catch (error) {
      if (error.code === 'stale-main-skip') { await observed('stale-main-skipped'); return { phase }; }
      throw error;
    }
    let terminal;
    try { terminal = receipt(await call('activate', pair), manifest, admission); }
    catch (error) {
      if (!['transport-uncertain', 'response-malformed'].includes(error.code)) throw error;
      await observed('activation-uncertain');
      // No activate/rollback/admit/receive retry. Missing receipt leaves operator reconciliation necessary.
      status(await call('status', [], undefined, true));
      preflight(await call('preflight', [], undefined, true));
      terminal = receipt(await call('receipt', [pair.join('-')], undefined, true), manifest, admission);
    }
    await observed('activation-observed');
    const verified = await call('verify', pair);
    requireThat(exact(verified, ['verified', 'image_id', 'snapshot']) && verified.verified === true
      && verified.image_id === manifest.image_id && verified.snapshot === terminal.snapshot_after_hash,
    'verify-binding');
    await observed('verified');
    receipt(await call('receipt', [pair.join('-')], undefined, true), manifest, admission);
    status(await call('status', [], undefined, true));
    const final = await call('preflight', [], undefined, true);
    preflight(final);
    requireThat(final.api_image === manifest.image_id && final.snapshot === terminal.snapshot_after_hash,
      'final-state');
    await observed('completed');
    return { phase };
  } catch (error) {
    if (journal) { await journal.writeFile(JSON.stringify({ phase: 'failed', observed_phase: phase }) + '\n'); await journal.sync(); }
    throw error instanceof ClientError ? error : new ClientError('client-failed');
  } finally { await archive.close(); if (journal) await journal.close(); }
}
async function main() {
  const args = process.argv.slice(2);
  const keys = ['--runner-config', '--manifest', '--archive', '--sha', '--run', '--phases'];
  requireThat(args.length === 12, 'arguments');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    requireThat(keys.includes(args[i]) && !Object.hasOwn(options, args[i]), 'arguments');
    options[args[i]] = args[i + 1];
  }
  const config = await runnerConfig(options['--runner-config']);
  const result = await deliver({ manifest: options['--manifest'], archive: options['--archive'],
    sha: options['--sha'], run: options['--run'], phases: options['--phases'] }, sshTransport(config));
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('{"phase":"failed"}\n'); process.exitCode = 1; });
}
