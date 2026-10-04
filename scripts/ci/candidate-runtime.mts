import { spawn } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  DIGEST, SHA, RUN, ID, PG, REDIS, ROLES, need, object, array, exact, same, hash,
  directory, fileHash, jsonFile, artifacts, history, ready, proof, owned, containerNetwork,
} from './candidate-runtime-contract.mts';
import type { Binding, Manifest, Resource, Role, Row, RuntimeProof } from './candidate-runtime-contract.mts';

interface Options { directory: string; source: string; binding: Binding }
interface State {
  version: 1; nonce: string; daemon_id: string; host: string; source: string;
  binding: Binding; resources: Resource[];
  status: 'intent' | 'cleaning' | 'cleaned' | 'complete'; proof: RuntimeProof | null;
}
interface Result { code: number | null; stdout: string; stderr: string }
interface Plan {
  version: 1; first_migrations: string[]; bootstrap_hashes: Record<string, string>;
  bootstrap_files: Record<string, string>; roles_sql: string; historical_create_sql: string;
  api_environment: Record<string, string>;
}
const BOOTSTRAP: Record<string, string> = {
  'reader-summary-publication-pre-migration.sql': '1d3d70d6587ab6c232a37fb1feaa0de098dee22bf973462b824b350407c428d0',
  'reader-summary-publication-post-migration.sql': '231876dc900c42981985d47ac073cfce7baa46805d3e5373c9a7863a470e3233',
  'reader-summary-publication-tenant-ownership.sql': 'cd85a07a070102cb31b5b5e3523760111a6e2bc286fa307f43348366947b9d6a',
};
const ENV: Record<string, string> = {
  NODE_ENV: 'test', SOCIAL_MONITOR_RUNTIME_PROFILE: 'deterministic-test',
  DATABASE_URL: 'postgresql://e2e_api:synthetic-e2e-only@postgres:5432/e2e',
  COLLECTOR_RUNTIME_PROFILE: 'in-memory', REDIS_URL: 'redis://redis:6379/0',
  SOCIAL_MONITOR_METRICS_MODE: 'in-memory', POSTGRES_RUNTIME_PROCESS: 'api-gateway',
  SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY: 'A'.repeat(43) + '=',
  MONITORING_PERSISTENCE: 'prisma', POSTGRES_RUNTIME_POOL_MIN: '0', POSTGRES_RUNTIME_POOL_MAX: '2',
  POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS: '5000', POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS: '10000',
  READER_VALUE_SCORING_LOOP: 'disabled', INTELLIGENCE_READER_SUMMARY_JOB_LOOP: 'disabled',
  INGESTION_SCAN_SCHEDULER_LOOP: 'disabled', INGESTION_SCAN_QUEUE_DRAIN_LOOP: 'disabled',
  INTELLIGENCE_SUMMARY_JOB_LOOP: 'disabled', INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP: 'disabled',
  INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP: 'disabled', INTELLIGENCE_AUTO_SUMMARY_SCHEDULER: 'disabled',
  INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP: 'disabled', DELIVERY_DIGEST_SCHEDULER_LOOP: 'disabled',
  DELIVERY_ATTEMPT_DISPATCH_LOOP: 'disabled', DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP: 'disabled',
  DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP: 'disabled', EVENT_RELAY_LOOP: 'disabled',
  INTELLIGENCE_SUMMARY_QUEUE_READER: 'in-memory', INGESTION_SCAN_QUEUE_READER: 'in-memory',
  SUMMARY_MODEL_PROVIDER: 'deterministic', READER_SUMMARY_MODEL_PROVIDER: 'deterministic',
  READER_SUMMARY_TOPIC_LABELER: 'deterministic', SUMMARY_MEMORY_MODE: 'disabled',
  DELIVERY_WEBHOOK_PROVIDER: 'in-memory', TRUSTED_WORKSPACE_ROLE_HEADER: 'disabled',
};
const ROLES_SQL = "CREATE ROLE sm_e2e_migrator LOGIN NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-e2e-only'; CREATE ROLE e2e_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-e2e-only'; CREATE ROLE e2e_system LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS; CREATE ROLE social_monitor_summary_once NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; CREATE ROLE social_monitor_reader_summary_daily_terminal LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; ALTER ROLE social_monitor_reader_summary_daily_terminal SET search_path TO pg_catalog, public; GRANT social_monitor_reader_summary_daily_terminal TO sm_e2e_migrator WITH ADMIN TRUE, INHERIT FALSE, SET FALSE; GRANT e2e_api TO sm_e2e_migrator WITH ADMIN TRUE, INHERIT FALSE, SET TRUE; ALTER DATABASE e2e OWNER TO e2e_api; GRANT CREATE ON DATABASE e2e TO sm_e2e_migrator; GRANT USAGE,CREATE ON SCHEMA public TO sm_e2e_migrator;";
const HISTORICAL_SQL = 'SET ROLE social_monitor_public_schema_owner; GRANT CREATE ON SCHEMA public TO social_monitor_reader_summary_publication_owner GRANTED BY social_monitor_public_schema_owner; RESET ROLE;';
const HTTP = String.raw`const http = require('node:http');
const req = http.get('http://127.0.0.1:3000/ready', {timeout: 4000}, res => {
  let size = 0; const chunks = [];
  res.on('data', b => { size += b.length; if (size > 262144) req.destroy(); else chunks.push(b); });
  res.on('end', () => {
    try { process.stdout.write(JSON.stringify({http_status: res.statusCode,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))})); }
    catch { process.exitCode = 1; }
  });
  res.on('error', () => { process.exitCode = 1; });
});
const timer = setTimeout(() => { req.destroy(); process.exitCode = 1; }, 5000);
req.on('timeout', () => req.destroy());
req.on('error', () => { process.exitCode = 1; });
req.on('close', () => clearTimeout(timer));`;

export function parseArgs(args: readonly string[]): Options {
  const values: Record<string, string> = {};
  const keys = ['--directory', '--source', '--sha', '--run-id', '--image-id',
    '--archive-sha256', '--manifest-sha256'];
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i], v = args[i + 1];
    need(k && keys.includes(k) && v && !v.startsWith('--') && values[k] === undefined, 'argument');
    values[k] = v;
  }
  need(Object.keys(values).length === keys.length, 'required-arguments');
  const get = (k: string): string => { const v = values[k]; need(v, 'argument'); return v; };
  const binding = { sha: get('--sha'), ci_run_id: get('--run-id'), image_id: get('--image-id'),
    archive_sha256: get('--archive-sha256'), manifest_sha256: get('--manifest-sha256') };
  need(SHA.test(binding.sha) && RUN.test(binding.ci_run_id)
    && [binding.image_id, binding.archive_sha256, binding.manifest_sha256].every(v => DIGEST.test(v)),
    'argument-identity');
  return { directory: get('--directory'), source: get('--source'), binding };
}
function resources(nonce: string, b: Binding): Resource[] {
  return ROLES.map(role => {
    const reference = role === 'postgres' ? PG : role === 'redis' ? REDIS
      : ['extract', 'first', 'full', 'api'].includes(role) ? b.image_id : null;
    return { role, kind: role === 'network' ? 'network' : role === 'pgdata' ? 'volume' : 'container',
      name: `sm-ci-runtime-${nonce}-${role}`, reference,
      image: reference === b.image_id ? b.image_id : null, id: null, pending: false };
  });
}
function validateState(value: unknown, o: Options, daemon: string, host: string): State {
  const s = exact(value, ['version', 'nonce', 'daemon_id', 'host', 'source',
    'binding', 'resources', 'status', 'proof']);
  need(s.version === 1 && typeof s.nonce === 'string' && /^[0-9a-f]{24}$/.test(s.nonce)
    && s.daemon_id === daemon && s.host === host && s.source === o.source
    && same(s.binding, o.binding) && ['intent', 'cleaning', 'cleaned', 'complete'].includes(String(s.status)),
    'ownership-state-binding');
  const rows = array(s.resources), expected = resources(s.nonce, o.binding);
  need(rows.length === expected.length, 'ownership-state-count');
  const validated = expected.map((r, index) => {
    const v = exact(rows[index], ['role', 'kind', 'name', 'reference', 'image', 'id', 'pending']);
    need(v.role === r.role && v.kind === r.kind && v.name === r.name && v.reference === r.reference
      && typeof v.pending === 'boolean' && (v.id === null || typeof v.id === 'string'
        && (r.kind === 'volume' ? v.id === r.name : ID.test(v.id))), 'ownership-state-resource');
    need(r.kind === 'container' ? v.image === null && v.id === null
      || typeof v.image === 'string' && DIGEST.test(v.image)
        && (r.image === null || v.image === r.image) : v.image === null, 'ownership-state-image');
    return { ...r, image: v.image as string | null, id: v.id as string | null, pending: v.pending };
  });
  need(s.status === 'complete' ? s.proof !== null && validated.every(r => r.id !== null && !r.pending)
    : s.proof === null, 'ownership-state-proof');
  return { version: 1, nonce: s.nonce, daemon_id: daemon, host, source: o.source,
    binding: o.binding, resources: validated, status: s.status as State['status'],
    proof: s.proof as RuntimeProof | null };
}
function validatePlan(value: unknown, o: Options, m: Manifest): Plan {
  const p = exact(value, ['version', 'first_migrations', 'bootstrap_hashes',
    'bootstrap_files', 'roles_sql', 'historical_create_sql', 'api_environment']);
  const first = m.migrations.filter(v => v.name < '20260716170000_reader_summary_fail_closed_publication');
  need(p.version === 1 && first.length === 10 && same(p.first_migrations, first.map(v => v.name))
    && same(p.bootstrap_hashes, BOOTSTRAP) && p.roles_sql === ROLES_SQL
    && p.historical_create_sql === HISTORICAL_SQL && same(p.api_environment, ENV), 'database-plan-contract');
  const files = exact(p.bootstrap_files, Object.keys(BOOTSTRAP));
  for (const name of Object.keys(BOOTSTRAP)) need(files[name] === path.join(o.source,
    name.includes('tenant-ownership') ? 'scripts/sql' : 'ops/deploy', name), 'bootstrap-source-path');
  return p as unknown as Plan;
}
async function atomic(file: string, value: unknown): Promise<void> {
  const pending = file + '.pending', bytes = JSON.stringify(value) + '\n';
  need(Buffer.byteLength(bytes) <= 4_000_000, 'private-output-limit');
  try { await fileHash(pending, 4_000_000, true); await unlink(pending); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const h = await open(pending, 'wx', 0o600);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
  await rename(pending, file);
  const d = await open(path.dirname(file), 'r');
  try { await d.sync(); } finally { await d.close(); }
}
export async function runtime(o: Options): Promise<RuntimeProof> {
  await directory(o.directory, true); await directory(o.source);
  need(/^[A-Za-z0-9_./-]+$/.test(o.directory)
    && o.directory !== o.source && !o.directory.startsWith(o.source + '/'), 'runtime-directory');
  need(fileURLToPath(import.meta.url) === path.join(o.source, 'scripts/ci/candidate-runtime.mts'),
    'fixed-runtime-source');
  const ci = process.env.GITHUB_ACTIONS === 'true';
  const host = process.env.DOCKER_HOST || '';
  need(host.length > 0 && host.length <= 512 && !Array.from(host).some(c => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)
    && (ci || /^unix:\/\/\/[A-Za-z0-9_./-]*\/(?:sm-rc-e2e-producer-|sm-ci-runtime-test-)[A-Za-z0-9_-]+\/docker\.sock$/.test(host)),
    'isolated-ci-or-test-daemon-required');
  if (ci) need(process.env.GITHUB_SHA === o.binding.sha
    && process.env.GITHUB_RUN_ID === o.binding.ci_run_id, 'ci-runtime-binding');
  if (host.startsWith('unix:///')) {
    const socket = host.slice(7);
    need((await lstat(socket)).isSocket(), 'docker-socket');
    const { realpath } = await import('node:fs/promises');
    need(await realpath(socket) === socket, 'docker-socket-alias');
  }
  const started = Date.now(); let deadline = started + 1_050_000;
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: '/nonexistent',
    LC_ALL: 'C', DOCKER_HOST: host, DOCKER_CONFIG: '/nonexistent', COMPOSE_DISABLE_ENV_FILE: '1' };
  const execute = async (program: string, args: string[], data = '', timeout = 30_000,
    allowFailure = false, limit = 2_000_000): Promise<Result> => {
    const budget = Math.min(timeout, deadline - Date.now()); need(budget > 0, 'runtime-deadline');
    const child = spawn(program, args, { cwd: o.source, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [], stderr: Buffer[] = []; let size = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), budget);
    child.stdin.on('error', () => {}); child.stdin.end(data);
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    exited.catch(() => {});
    const drain = async (pipe: NodeJS.ReadableStream, chunks: Buffer[]): Promise<void> => {
      for await (const value of pipe) {
        const b = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
        size += b.length; need(size <= limit, 'runtime-command-output-limit'); chunks.push(b);
      }
    };
    try {
      const [code] = await Promise.all([exited, drain(child.stdout, stdout), drain(child.stderr, stderr)]);
      const result = { code, stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8') };
      need(allowFailure || code === 0, 'runtime-command-failed'); return result;
    } finally { child.kill('SIGKILL'); await exited.catch(() => {}); clearTimeout(timer); }
  };
  const rawDocker = async (args: string[], data = '', timeout = 30_000, allowFailure = false,
    limit = 2_000_000): Promise<Result> => execute('docker', ['--host', host, ...args], data, timeout, allowFailure, limit);
  const daemon = async (): Promise<string> => {
    const v = object(JSON.parse((await rawDocker(['version', '--format', '{{json .Server}}'])).stdout));
    const i = object(JSON.parse((await rawDocker(['info', '--format', '{{json .}}'])).stdout));
    need(typeof v.Version === 'string' && /^29\./.test(v.Version) && i.OSType === 'linux'
      && ['x86_64', 'amd64'].includes(String(i.Architecture))
      && array(i.DriverStatus).some(v => same(v, ['driver-type', 'io.containerd.snapshotter.v1']))
      && typeof i.ID === 'string' && /^[A-Za-z0-9:_-]{8,128}$/.test(i.ID), 'native-docker29-required');
    return i.ID;
  };
  const daemonId = await daemon();
  const docker = async (args: string[], data = '', timeout = 30_000, allowFailure = false,
    limit = 2_000_000): Promise<Result> => {
    need(await daemon() === daemonId, 'daemon-fence');
    return rawDocker(args, data, timeout, allowFailure, limit);
  };
  const jsonDocker = async (args: string[]): Promise<unknown> => JSON.parse((await docker(args)).stdout) as unknown;
  const source = async (): Promise<void> => {
    need((await execute('git', ['rev-parse', '--verify', 'HEAD^{commit}'])).stdout.trim() === o.binding.sha
      && !(await execute('git', ['status', '--porcelain', '--untracked-files=normal'])).stdout.trim(), 'runtime-source');
    for (const relative of ['scripts/ci/release-candidate.mjs', 'scripts/ci/candidate-runtime.mts',
      'scripts/ci/candidate-runtime-contract.mts', 'ops/ci/release-database-plan.py']) {
      const actual = await fileHash(path.join(o.source, relative));
      need(actual.sha256 === hash((await execute('git', ['show', o.binding.sha + ':' + relative])).stdout),
        'uncommitted-runtime-source');
    }
  };
  let m = await artifacts(o.directory, o.binding);
  const image = async (): Promise<Row> => {
    const rows = array(await jsonDocker(['image', 'inspect', o.binding.image_id]));
    need(rows.length === 1, 'candidate-image-count');
    const v = object(rows[0]), c = object(v.Config), labels = object(c.Labels);
    need(v.Id === o.binding.image_id && v.Os === 'linux' && v.Architecture === 'amd64'
      && labels['org.opencontainers.image.revision'] === o.binding.sha
      && labels['social-monitor.ci-run-id'] === o.binding.ci_run_id
      && object(v.RootFS).Type === 'layers' && same(object(v.RootFS).Layers, m.image_graph.diff_ids)
      && same(v.Descriptor, m.image_graph.descriptor)
      && Object.keys(object(c.Volumes ?? {})).length === 0, 'candidate-image-binding');
    return v;
  };
  await source(); const candidateImage = await image();
  const privateRoot = path.join(o.directory, 'runtime-private');
  await mkdir(privateRoot, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; });
  await directory(privateRoot, true);
  for (const name of await readdir(privateRoot)) need(['state.json', 'state.json.pending', 'failure.json',
    'failure.json.pending'].includes(name) || /^[0-9a-f]{24}$/.test(name), 'private-directory-foreign-entry');
  const stateFile = path.join(privateRoot, 'state.json');
  let state: State | null = null;
  try { state = validateState(await jsonFile(stateFile, true), o, daemonId, host); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const save = async (): Promise<void> => { need(state, 'state-required'); await atomic(stateFile, state); };
  const resource = (role: Role): Resource => {
    const r = state?.resources.find(v => v.role === role); need(r, 'resource-required'); return r;
  };
  const work = (): string => { need(state, 'state-required'); return path.join(privateRoot, state.nonce); };
  const present = async (r: Resource): Promise<boolean> => {
    const args = r.kind === 'container' ? ['container', 'ls', '--all', '--no-trunc', '--format', '{{.Names}}']
      : [r.kind, 'ls', '--format', '{{.Name}}'];
    const names = (await docker(args)).stdout.trim().split('\n').filter(Boolean);
    need(names.filter(n => n === r.name).length <= 1, 'resource-name-count');
    return names.includes(r.name);
  };
  const inspect = async (r: Resource): Promise<Row> => {
    need(state, 'state-required');
    const rows = array(await jsonDocker([r.kind, 'inspect', r.id ?? r.name]));
    need(rows.length === 1, 'resource-inspect-count');
    const v = owned(rows[0], r, state.nonce, o.binding);
    if (r.kind === 'container') {
      const h = object(v.HostConfig), mounts = array(v.Mounts), config = object(v.Config);
      const network = resource('network');
      if (r.role !== 'extract') await inspect(network);
      containerNetwork(v, r, network);
      if (r.role === 'postgres') {
        const mount = object(mounts[0]);
        need(mounts.length === 1 && mount.Type === 'volume' && mount.Name === resource('pgdata').name
          && mount.Destination === '/var/lib/postgresql' && mount.RW === true, 'postgres-volume-binding');
      } else if (r.role === 'first') {
        const mount = object(mounts[0]);
        need(mounts.length === 1 && mount.Type === 'bind' && mount.Source === path.join(work(), 'initial')
          && mount.Destination === '/app/prisma/migrations' && mount.RW === false, 'initial-bind');
      } else need(mounts.length === 0 || r.role === 'redis' && mounts.every(v => {
        const mount = object(v); return mount.Type === 'tmpfs' && mount.Destination === '/data';
      }), 'unexpected-container-mount');
      const tmpfs = object(h.Tmpfs ?? {});
      need(r.role === 'redis' ? Object.keys(tmpfs).length === 1 && typeof tmpfs['/data'] === 'string'
        : Object.keys(tmpfs).length === 0, 'unexpected-tmpfs');
      if (r.role === 'api') {
        const original = object(candidateImage.Config);
        need(same(config.Entrypoint ?? null, original.Entrypoint ?? null)
          && same(config.Cmd ?? null, original.Cmd ?? null), 'normal-api-entrypoint');
        const envs = array(config.Env).map(v => { need(typeof v === 'string', 'api-environment'); return v; });
        for (const [key, value] of Object.entries(ENV))
          need(envs.filter(v => v.startsWith(key + '=')).length === 1 && envs.includes(key + '=' + value),
            'api-environment-binding');
      } else if (['first', 'full'].includes(r.role)) need(same(config.Entrypoint,
        ['/app/node_modules/.bin/prisma']) && same(config.Cmd, ['migrate', 'deploy']), 'actual-prisma-entrypoint');
      else if (r.role === 'extract') need(same(config.Entrypoint, ['/usr/bin/true']), 'extract-entrypoint');
    }
    return v;
  };
  const labels = (r: Resource): string[] => {
    need(state, 'state-required');
    return Object.entries({ 'io.social-monitor.ci-runtime': state.nonce,
      'io.social-monitor.ci-runtime.role': r.role, 'org.opencontainers.image.revision': o.binding.sha,
      'social-monitor.ci-run-id': o.binding.ci_run_id }).flatMap(([k, v]) => ['--label', k + '=' + v]);
  };
  const createArgs = async (r: Resource): Promise<string[]> => {
    if (r.kind === 'network') return ['network', 'create', '--internal', '--driver', 'bridge', ...labels(r), r.name];
    if (r.kind === 'volume') return ['volume', 'create', '--driver', 'local', ...labels(r), r.name];
    need(r.reference && r.image, 'container-image-required');
    if (r.role !== 'extract') await inspect(resource('network'));
    const args = ['container', 'create', '--name', r.name, ...labels(r), '--pull=never',
      '--network', r.role === 'extract' ? 'none' : resource('network').name];
    if (['postgres', 'redis', 'api'].includes(r.role)) args.push('--network-alias', r.role);
    if (r.role === 'postgres') {
      await inspect(resource('pgdata'));
      args.push('--mount', `type=volume,source=${resource('pgdata').name},target=/var/lib/postgresql`);
      for (const [k, v] of Object.entries({ POSTGRES_USER: 'postgres', POSTGRES_DB: 'e2e',
        POSTGRES_PASSWORD: 'synthetic-e2e-only', PGDATA: '/var/lib/postgresql/18/docker',
        POSTGRES_INITDB_ARGS: '--auth-local=trust --auth-host=scram-sha-256' })) args.push('-e', k + '=' + v);
    } else if (r.role === 'redis') args.push('--tmpfs', '/data:rw,nosuid,nodev,size=16777216');
    else if (r.role === 'extract') args.push('--entrypoint', '/usr/bin/true');
    else if (r.role === 'api') {
      const p = validatePlan(await jsonFile(path.join(work(), 'plan.json'), true), o, m);
      for (const [k, v] of Object.entries(p.api_environment)) args.push('-e', k + '=' + v);
    } else {
      const user = r.role === 'first' ? 'e2e_api' : 'sm_e2e_migrator';
      args.push('--entrypoint', '/app/node_modules/.bin/prisma', '-e',
        `DATABASE_URL=postgresql://${user}:synthetic-e2e-only@postgres:5432/e2e`);
      if (r.role === 'first') {
        await directory(path.join(work(), 'initial'));
        args.push('--mount', `type=bind,source=${path.join(work(), 'initial')},target=/app/prisma/migrations,readonly`);
      }
    }
    args.push(r.reference);
    if (r.role === 'redis') args.push('redis-server', '--save', '', '--appendonly', 'no');
    if (r.role === 'first' || r.role === 'full') args.push('migrate', 'deploy');
    return args;
  };
  const observe = async (r: Resource): Promise<void> => {
    const v = await inspect(r);
    r.id = String(r.kind === 'volume' ? v.Name : v.Id); r.pending = false; await save();
  };
  const create = async (role: Role): Promise<void> => {
    const r = resource(role); need(!await present(r), 'resource-collision');
    const args = await createArgs(r);
    r.pending = true; await save();
    await docker(args); await observe(r);
  };
  const exec = async (role: Role, args: string[], data = '', timeout = 30_000,
    allowFailure = false, limit = 2_000_000): Promise<Result> => {
    const r = resource(role); await inspect(r); need(r.id, 'container-id-required');
    return docker(['exec', '-i', r.id, ...args], data, timeout, allowFailure, limit);
  };
  const cleanup = async (): Promise<void> => {
    need(state, 'state-required'); state.status = 'cleaning'; state.proof = null; await save();
    for (const r of state.resources.filter(r => r.pending)) {
      if (!await present(r)) await docker(await createArgs(r));
      await observe(r);
    }
    const ordered = [...state.resources.filter(r => r.kind === 'container'),
      ...state.resources.filter(r => r.kind === 'network'), ...state.resources.filter(r => r.kind === 'volume')];
    for (const r of ordered) if (await present(r)) await inspect(r);
    for (const r of ordered) if (await present(r)) {
      const v = await inspect(r), id = String(r.kind === 'volume' ? v.Name : v.Id);
      await docker([r.kind, 'rm', ...(r.kind === 'container' ? ['-f'] : []), id]);
    }
    for (const r of ordered) need(!await present(r), 'cleanup-incomplete');
    for (const kind of ['container', 'network', 'volume']) {
      const args = kind === 'container' ? ['container', 'ls', '--all', '--quiet']
        : [kind, 'ls', '--quiet'];
      need(!(await docker([...args, '--filter', 'label=io.social-monitor.ci-runtime=' + state.nonce]))
        .stdout.trim(), 'cleanup-unrecorded-resource');
    }
    need(await daemon() === daemonId, 'cleanup-daemon-fence');
    state.status = 'cleaned'; await save();
  };
  if (state?.status === 'complete') {
    const retained = proof(state.proof, o.binding, daemonId, m);
    await source(); m = await artifacts(o.directory, o.binding); await image();
    need(await daemon() === daemonId, 'completed-daemon-fence'); return retained;
  }
  if (state) { deadline = started + 1_180_000; await cleanup(); deadline = started + 1_050_000; }
  const nonce = randomBytes(12).toString('hex');
  state = { version: 1, nonce, daemon_id: daemonId, host, source: o.source, binding: o.binding,
    resources: resources(nonce, o.binding), status: 'intent', proof: null };
  for (const r of state.resources) need(!await present(r), 'resource-collision');
  await save(); await mkdir(work(), { mode: 0o700 }); await directory(work(), true);
  let observedHistory = '', systemId = '', apiId = '', apiStarted = '', succeeded = false;
  try {
    for (const role of ['postgres', 'redis'] as const) {
      const r = resource(role); need(r.reference, 'dependency-reference');
      await docker(['image', 'pull', '--platform', 'linux/amd64', r.reference], '', 300_000);
      const rows = array(await jsonDocker(['image', 'inspect', r.reference]));
      need(rows.length === 1, 'dependency-image-count');
      const v = object(rows[0]);
      need(typeof v.Id === 'string' && DIGEST.test(v.Id) && v.Os === 'linux'
        && v.Architecture === 'amd64' && array(v.RepoDigests).includes(r.reference), 'pinned-dependency-image');
      r.image = v.Id; await save();
    }
    await create('network'); await create('pgdata'); await create('extract');
    const extracted = path.join(work(), 'extracted'), initial = path.join(work(), 'initial');
    await mkdir(extracted, { mode: 0o755 });
    await inspect(resource('extract')); need(resource('extract').id, 'extract-id');
    await docker(['cp', resource('extract').id + ':/app/prisma/migrations/.', extracted]);
    const p = validatePlan(JSON.parse((await execute('python3', ['-I', '-B',
      path.join(o.source, 'ops/ci/release-database-plan.py'), '--manifest',
      path.join(o.directory, 'manifest.json'), '--source', o.source, '--extracted', extracted,
      '--initial', initial], '', 60_000)).stdout), o, m);
    await atomic(path.join(work(), 'plan.json'), p);
    const bootstrap = path.join(work(), 'bootstrap'); await mkdir(bootstrap, { mode: 0o755 });
    for (const name of Object.keys(BOOTSTRAP)) {
      const original = p.bootstrap_files[name], expected = BOOTSTRAP[name];
      need(original && expected && (await fileHash(original)).sha256 === 'sha256:' + expected, 'bootstrap-source');
      const target = path.join(bootstrap, name); await copyFile(original, target); await chmod(target, 0o444);
      need((await fileHash(target)).sha256 === 'sha256:' + expected, 'bootstrap-copy');
    }
    await create('postgres'); await create('redis');
    for (const role of ['postgres', 'redis'] as const) {
      const r = resource(role); await inspect(r); need(r.id, 'start-id'); await docker(['container', 'start', r.id]);
    }
    const pgEnd = Math.min(deadline, Date.now() + 60_000); let pgReady = false;
    for (let attempt = 0; attempt < 45 && Date.now() < pgEnd; attempt++) {
      if ((await exec('postgres', ['pg_isready', '-U', 'postgres', '-d', 'e2e'], '', 10_000, true)).code === 0) {
        pgReady = true; break;
      }
      await delay(1000);
    }
    need(pgReady, 'postgres-start-timeout');
    const sql = async (query: string, user = 'sm_e2e_migrator'): Promise<string> =>
      (await exec('postgres', ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', 'e2e'], query)).stdout.trim();
    need(/^18[0-9]{4}$/.test(await sql('SHOW server_version_num;', 'postgres')), 'postgres18-required');
    systemId = await sql('SELECT system_identifier::text FROM pg_control_system();', 'postgres');
    need(/^[1-9][0-9]{0,19}$/.test(systemId) && BigInt(systemId) <= 18446744073709551615n
      && systemId !== '7688442011877063482', 'test-system-identifier');
    await sql(p.roles_sql, 'postgres');
    const migrate = async (role: 'first' | 'full'): Promise<void> => {
      await create(role); const r = resource(role); await inspect(r); need(r.id, 'prisma-id');
      await docker(['container', 'start', '--attach', r.id], '', 300_000);
      const after = await inspect(r), s = object(after.State);
      need(s.Running === false && s.ExitCode === 0, 'actual-prisma-deploy-failed');
    };
    await migrate('first');
    await exec('postgres', ['mkdir', '-p', '/tmp/sm-e2e-bootstrap']);
    await inspect(resource('postgres')); need(resource('postgres').id, 'postgres-id');
    await docker(['cp', bootstrap + '/.', resource('postgres').id + ':/tmp/sm-e2e-bootstrap']);
    const bootstrapSql = async (phase: 'pre' | 'post'): Promise<void> => {
      await exec('postgres', ['psql', '-X', '-U', 'sm_e2e_migrator', '-d', 'e2e',
        '-v', 'ON_ERROR_STOP=1', '-v', 'runtime_role=e2e_api', '-v', 'system_runtime_role=e2e_system',
        '-f', '/tmp/sm-e2e-bootstrap/reader-summary-publication-' + phase + '-migration.sql']);
    };
    await bootstrapSql('pre'); await sql(p.historical_create_sql); await migrate('full'); await bootstrapSql('post');
    const applied: unknown = JSON.parse(await sql('SELECT coalesce(json_agg(json_build_object('
      + "'name',migration_name,'checksum',checksum,'finished_at',finished_at::text,"
      + "'rolled_back_at',rolled_back_at::text) ORDER BY migration_name), '[]'::json)"
      + ' FROM public."_prisma_migrations";', 'postgres'));
    observedHistory = history(applied, m); await atomic(path.join(work(), 'history.json'), applied);
    await create('api'); const api = resource('api'); await inspect(api); need(api.id, 'api-id');
    await docker(['container', 'start', api.id]);
    const stamp = async (): Promise<{ id: string; image: string; started: string; running: true }> => {
      const row = await inspect(api), s = object(row.State);
      need(typeof row.Id === 'string' && ID.test(row.Id) && row.Image === o.binding.image_id
        && s.Running === true && typeof s.StartedAt === 'string' && s.StartedAt.length <= 64, 'api-state');
      return { id: row.Id, image: o.binding.image_id, started: s.StartedAt, running: true };
    };
    const before = await stamp(), apiEnd = Math.min(deadline, Date.now() + 90_000); let poolOk = false;
    for (let attempt = 0; attempt < 45 && Date.now() < apiEnd; attempt++) {
      need(same(await stamp(), before), 'api-restarted-before-probe');
      const response = await exec('api', ['/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin',
        '/usr/local/bin/node', '--no-addons', '-e', HTTP], '', 10_000, true, 300_000);
      need(same(await stamp(), before), 'api-restarted-after-probe');
      if (response.code === 0) {
        const value: unknown = JSON.parse(response.stdout);
        if (object(value).http_status === 200) { poolOk = ready(value); break; }
      }
      await delay(1000);
    }
    need(poolOk, 'actual-api-pool-not-ready');
    apiId = before.id; apiStarted = before.started; succeeded = true;
  } catch (error) {
    let firstError: string | null = null;
    try {
      const pg = resource('postgres');
      if (await present(pg)) {
        await inspect(pg); need(pg.id, 'postgres-log-id');
        const logs = await docker(['logs', '--tail', '5000', pg.id], '', 10_000, true);
        firstError = (logs.stdout + '\n' + logs.stderr).split('\n').find(v => v.includes('ERROR:'))?.slice(0, 4096) ?? null;
      }
    } catch { /* Failure to observe logs cannot establish database success. */ }
    const failure = path.join(privateRoot, 'failure.json');
    try { await fileHash(failure, 4_000_000, true); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      await atomic(failure, { first_postgres_sql_error: firstError, runtime_failed: true });
    }
    throw error;
  } finally { deadline = started + 1_180_000; await cleanup(); }
  need(succeeded, 'runtime-incomplete');
  await source(); m = await artifacts(o.directory, o.binding); await image();
  need(await daemon() === daemonId, 'final-daemon-fence');
  const result = proof({ schema: 'social-monitor-candidate-runtime-v1', ...o.binding,
    daemon_id: daemonId, postgres_system_identifier: systemId, postgres_major: 18,
    api_container_id: apiId, api_started_at: apiStarted, history_sha256: observedHistory,
    postgres_pool_ok: true, cleanup_verified: true }, o.binding, daemonId, m);
  state.status = 'complete'; state.proof = result; await save(); return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runtime(parseArgs(process.argv.slice(2))).then(value => {
    process.stdout.write(JSON.stringify(value) + '\n');
  }).catch(() => { process.stderr.write('candidate-runtime: qualification-failed\n'); process.exitCode = 1; });
}
