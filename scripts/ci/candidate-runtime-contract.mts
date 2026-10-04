import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const SHA = /^[0-9a-f]{40}$/;
export const RUN = /^[1-9][0-9]{0,14}$/;
export const ID = /^[0-9a-f]{64}$/;
export const PG = 'postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722';
export const REDIS = 'redis@sha256:3811787313eba226a2ef38658c6ccb91cd5e110edc89c37767de373120a0e5a0';
export type Row = Record<string, unknown>;
export interface Migration { name: string; checksum: string }
export interface Manifest {
  sha: string; ci_run_id: string; image_id: string; archive_sha256: string;
  archive_bytes: number; migrations: Migration[];
  image_graph: Row & { diff_ids: string[]; descriptor: Row };
}
export interface Binding {
  sha: string; ci_run_id: string; image_id: string;
  archive_sha256: string; manifest_sha256: string;
}
export interface RuntimeProof extends Binding {
  schema: 'social-monitor-candidate-runtime-v1'; daemon_id: string;
  postgres_system_identifier: string; postgres_major: 18;
  api_container_id: string; api_started_at: string; history_sha256: string;
  postgres_pool_ok: true; cleanup_verified: true;
}
export const ROLES = ['network', 'pgdata', 'postgres', 'redis', 'extract', 'first', 'full', 'api'] as const;
export type Role = typeof ROLES[number];
export interface Resource {
  role: Role; kind: 'container' | 'network' | 'volume'; name: string;
  reference: string | null; image: string | null; id: string | null; pending: boolean;
}
export function need(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(reason);
}
export function object(value: unknown): Row {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'object-required');
  return value as Row;
}
export function array(value: unknown): unknown[] {
  need(Array.isArray(value), 'array-required'); return value;
}
export function exact(value: unknown, keys: readonly string[]): Row {
  const v = object(value);
  need(Object.keys(v).sort().join(',') === [...keys].sort().join(','), 'unknown-fields');
  return v;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(object(value))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  need(value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value), 'non-json-value');
  return JSON.stringify(value);
}
export function same(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
export function hash(value: string | Buffer): string {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}
async function trustedAncestors(file: string, reason: string): Promise<void> {
  need(path.isAbsolute(file) && path.normalize(file) === file, reason);
  const root = path.parse(file).root;
  const entries = [root];
  let current = root;
  for (const component of file.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component); entries.push(current);
  }
  let sticky = false;
  for (const [index, entry] of entries.entries()) {
    const s = await lstat(entry);
    need(!s.isSymbolicLink(), reason);
    const trusted = s.uid === 0 || s.uid === process.geteuid?.();
    if (sticky) need(trusted, 'untrusted-directory');
    if (index < entries.length - 1) {
      need(s.isDirectory() && trusted, 'untrusted-directory');
      need(!(s.mode & 0o022) || Boolean(s.mode & 0o1000),
        'untrusted-directory');
      sticky = Boolean(s.mode & 0o022);
    }
  }
}
export async function directory(file: string, privateMode = false): Promise<void> {
  await trustedAncestors(file, 'noncanonical-directory');
  need(await realpath(file) === file, 'noncanonical-directory');
  const s = await lstat(file);
  need(s.isDirectory() && !(s.mode & 0o022)
    && (s.uid === 0 || s.uid === process.geteuid?.()), 'untrusted-directory');
  if (privateMode) need((s.mode & 0o777) === 0o700 && s.uid === process.geteuid?.(),
    'private-directory-permissions');
}
export async function fileHash(file: string, limit = 4_000_000, privateMode = false):
Promise<{ sha256: string; bytes: number }> {
  await trustedAncestors(file, 'noncanonical-file');
  need(await realpath(file) === file, 'noncanonical-file');
  const before = await lstat(file);
  need(before.isFile() && before.size > 0 && before.size <= limit && !(before.mode & 0o022)
    && (before.uid === 0 || before.uid === process.geteuid?.()), 'untrusted-file');
  if (privateMode) need((before.mode & 0o777) === 0o600
    && before.uid === process.geteuid?.(), 'private-file-permissions');
  const h = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  const digest = createHash('sha256'); let bytes = 0;
  try {
    const opened = await h.stat();
    need(opened.ino === before.ino && opened.dev === before.dev, 'file-replaced');
    const buffer = Buffer.alloc(1_048_576);
    for (;;) {
      const n = (await h.read(buffer, 0, buffer.length, null)).bytesRead;
      if (!n) break;
      bytes += n; need(bytes <= limit, 'file-limit'); digest.update(buffer.subarray(0, n));
    }
    const after = await lstat(file), end = await h.stat();
    need(after.ino === before.ino && after.dev === before.dev && end.size === bytes
      && before.size === bytes && after.size === bytes && before.mtimeMs === after.mtimeMs
      && before.ctimeMs === after.ctimeMs && end.mtimeMs === before.mtimeMs
      && end.ctimeMs === before.ctimeMs, 'file-changed');
    return { sha256: 'sha256:' + digest.digest('hex'), bytes };
  } finally { await h.close(); }
}
export async function jsonFile(file: string, privateMode = false): Promise<unknown> {
  const sum = await fileHash(file, 4_000_000, privateMode), bytes = await readFile(file);
  need(hash(bytes) === sum.sha256 && (await fileHash(file, 4_000_000, privateMode)).sha256 === sum.sha256,
    'json-file-changed');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
function descriptor(value: unknown, media: readonly string[]): Row {
  const d = object(value);
  need(Object.keys(d).every(k => ['mediaType', 'digest', 'size', 'platform', 'annotations'].includes(k))
    && typeof d.mediaType === 'string' && media.includes(d.mediaType)
    && typeof d.digest === 'string' && DIGEST.test(d.digest)
    && typeof d.size === 'number' && Number.isSafeInteger(d.size) && d.size > 0
    && d.size <= 2 ** 31, 'descriptor');
  if (d.platform !== undefined) {
    const p = exact(d.platform, ['os', 'architecture']);
    need(p.os === 'linux' && p.architecture === 'amd64', 'descriptor-platform');
  }
  if (d.annotations !== undefined) {
    const a = object(d.annotations);
    need(Object.keys(a).length <= 16 && Object.entries(a).every(([k, v]) =>
      k.length <= 256 && typeof v === 'string' && v.length <= 4096)
      && !a['org.opencontainers.image.ref.name']
      && a['vnd.docker.reference.type'] !== 'attestation-manifest', 'descriptor-annotations');
  }
  return d;
}
export function manifest(value: unknown): Manifest {
  const m = exact(value, ['sha', 'ci_run_id', 'image_id', 'archive_sha256',
    'archive_bytes', 'migrations', 'image_graph']);
  need(typeof m.sha === 'string' && SHA.test(m.sha) && typeof m.ci_run_id === 'string'
    && RUN.test(m.ci_run_id) && typeof m.image_id === 'string' && DIGEST.test(m.image_id)
    && typeof m.archive_sha256 === 'string' && DIGEST.test(m.archive_sha256)
    && typeof m.archive_bytes === 'number' && Number.isSafeInteger(m.archive_bytes)
    && m.archive_bytes > 0 && m.archive_bytes <= 10_000_000_000, 'manifest-binding');
  const g = exact(m.image_graph, ['kind', 'root_digest', 'descriptor',
    'config_digest', 'config', 'layers', 'diff_ids']);
  const d = descriptor(g.descriptor, ['application/vnd.oci.image.manifest.v1+json']);
  const c = descriptor(g.config, ['application/vnd.oci.image.config.v1+json']);
  const layers = array(g.layers), diffs = array(g.diff_ids);
  need(g.kind === 'oci-manifest' && g.root_digest === m.image_id && d.digest === m.image_id
    && typeof g.config_digest === 'string' && DIGEST.test(g.config_digest)
    && g.config_digest !== m.image_id && c.digest === g.config_digest
    && layers.length > 0 && layers.length <= 128 && diffs.length === layers.length
    && diffs.every(v => typeof v === 'string' && DIGEST.test(v)), 'manifest-graph');
  layers.forEach(v => descriptor(v, ['application/vnd.oci.image.layer.v1.tar',
    'application/vnd.oci.image.layer.v1.tar+gzip']));
  let previous = '';
  const migrations = array(m.migrations).map(value => {
    const v = exact(value, ['name', 'checksum']);
    need(typeof v.name === 'string' && /^[0-9]{14}_[a-z0-9_]+$/.test(v.name)
      && v.name.length <= 256 && v.name > previous && typeof v.checksum === 'string'
      && /^[0-9a-f]{64}$/.test(v.checksum), 'migration-inventory');
    previous = v.name; return { name: v.name, checksum: v.checksum };
  });
  need(migrations.length > 0 && migrations.length <= 10_000, 'migration-count');
  return { sha: m.sha, ci_run_id: m.ci_run_id, image_id: m.image_id,
    archive_sha256: m.archive_sha256, archive_bytes: m.archive_bytes, migrations,
    image_graph: { ...g, descriptor: d, diff_ids: diffs as string[] } };
}
export async function artifacts(root: string, binding: Binding): Promise<Manifest> {
  await directory(root, true);
  const mf = path.join(root, 'manifest.json');
  need((await fileHash(mf)).sha256 === binding.manifest_sha256, 'manifest-changed');
  const m = manifest(await jsonFile(mf));
  for (const k of ['sha', 'ci_run_id', 'image_id', 'archive_sha256'] as const)
    need(m[k] === binding[k], 'artifact-binding');
  const sum = await fileHash(path.join(root, 'candidate.tar'), 10_000_000_000);
  need(sum.sha256 === binding.archive_sha256 && sum.bytes === m.archive_bytes, 'archive-changed');
  return m;
}
export function history(value: unknown, m: Manifest): string {
  const rows = array(value).map(value => {
    const r = exact(value, ['name', 'checksum', 'finished_at', 'rolled_back_at']);
    need(typeof r.finished_at === 'string' && r.finished_at.length > 0
      && r.finished_at.length <= 128 && r.rolled_back_at === null, 'unfinished-history');
    return { name: r.name, checksum: r.checksum };
  });
  need(same(rows, m.migrations), 'actual-prisma-history-mismatch');
  return hash(canonical(m.migrations));
}
export function ready(value: unknown): true {
  const v = exact(value, ['http_status', 'body']), b = object(v.body);
  need(v.http_status === 200 && b.status === 'ok' && b.service === 'api-gateway'
    && (b.ready === undefined || b.ready === true), 'readiness-http');
  const checks = array(b.checks), names = new Set<string>();
  need(checks.length <= 32, 'readiness-count');
  for (const value of checks) {
    const c = object(value);
    need(typeof c.name === 'string' && /^[a-z][a-z0-9_-]{0,127}$/.test(c.name)
      && !names.has(c.name) && ['ok', 'degraded'].includes(String(c.status)), 'readiness-check');
    names.add(c.name);
  }
  const pools = checks.map(object).filter(c => c.name === 'postgres_runtime_pool');
  const p = pools[0];
  need(pools.length === 1 && p && p.status === 'ok' && p.skipped !== true && p.enabled !== false
    && p.detail === 'A query completed through the bounded shared Prisma pool.', 'readiness-pool');
  return true;
}
export function proof(value: unknown, binding: Binding, daemon: string, m: Manifest): RuntimeProof {
  const v = exact(value, ['schema', 'sha', 'ci_run_id', 'image_id', 'archive_sha256',
    'manifest_sha256', 'daemon_id', 'postgres_system_identifier', 'postgres_major',
    'api_container_id', 'api_started_at', 'history_sha256', 'postgres_pool_ok', 'cleanup_verified']);
  need(v.schema === 'social-monitor-candidate-runtime-v1', 'proof-schema');
  for (const key of ['sha', 'ci_run_id', 'image_id', 'archive_sha256', 'manifest_sha256'] as const)
    need(v[key] === binding[key], 'proof-binding');
  need(SHA.test(binding.sha) && RUN.test(binding.ci_run_id)
    && [binding.image_id, binding.archive_sha256, binding.manifest_sha256].every(v => DIGEST.test(v)),
    'proof-identity');
  need(v.daemon_id === daemon && daemon.length > 0 && daemon.length <= 128
    && !/[\x00-\x20\x7f]/.test(daemon), 'proof-daemon');
  need(typeof v.postgres_system_identifier === 'string'
    && /^[1-9][0-9]{0,19}$/.test(v.postgres_system_identifier)
    && BigInt(v.postgres_system_identifier) <= 18446744073709551615n
    && v.postgres_system_identifier !== '7688442011877063482' && v.postgres_major === 18, 'proof-postgres');
  need(typeof v.api_container_id === 'string' && ID.test(v.api_container_id)
    && typeof v.api_started_at === 'string' && v.api_started_at.length <= 64
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(v.api_started_at)
    && !v.api_started_at.startsWith('0001-') && Number.isFinite(Date.parse(v.api_started_at)), 'proof-api');
  need(v.history_sha256 === hash(canonical(m.migrations)) && v.postgres_pool_ok === true
    && v.cleanup_verified === true, 'proof-incomplete');
  return v as unknown as RuntimeProof;
}
export function owned(value: unknown, r: Resource, nonce: string, binding: Binding): Row {
  const v = object(value), config = r.kind === 'container' ? object(v.Config) : v;
  const labels = object(config.Labels);
  need(labels['io.social-monitor.ci-runtime'] === nonce
    && labels['io.social-monitor.ci-runtime.role'] === r.role
    && labels['org.opencontainers.image.revision'] === binding.sha
    && labels['social-monitor.ci-run-id'] === binding.ci_run_id, 'foreign-resource');
  const identifier = r.kind === 'volume' ? v.Name : v.Id;
  need(typeof identifier === 'string' && (r.kind === 'volume' ? identifier === r.name : ID.test(identifier))
    && (r.id === null || identifier === r.id)
    && v.Name === (r.kind === 'container' ? '/' : '') + r.name, 'resource-identity');
  if (r.kind === 'container') {
    const h = object(v.HostConfig), ports = object(object(v.NetworkSettings).Ports ?? {});
    need(r.image !== null && v.Image === r.image && config.Image === r.reference
      && h.Privileged === false && h.PublishAllPorts === false
      && Object.keys(object(h.PortBindings ?? {})).length === 0
      && Object.values(ports).every(v => v === null) && array(h.Binds ?? []).length === 0
      && array(h.CapAdd ?? []).length === 0 && array(h.Devices ?? []).length === 0
      && h.PidMode !== 'host' && h.IpcMode !== 'host', 'unsafe-container');
  } else if (r.kind === 'network') {
    need(v.Internal === true && v.Driver === 'bridge'
      && Object.keys(object(v.Options ?? {})).length === 0, 'unsafe-network');
  } else need(v.Driver === 'local' && Object.keys(object(v.Options ?? {})).length === 0, 'unsafe-volume');
  return v;
}
