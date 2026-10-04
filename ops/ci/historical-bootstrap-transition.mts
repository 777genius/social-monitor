import { spawn } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseJson } from '../../scripts/ci/hetzner-release-authority.mts';
import {
  DIGEST, SHA, RUN, ID, PG, REDIS, need, object, array, exact, same, canonical,
  hash, directory, fileHash, artifacts, proof, ready,
} from '../../scripts/ci/candidate-runtime-contract.mts';
import type { Binding, Migration, Row } from '../../scripts/ci/candidate-runtime-contract.mts';

// An operator-invoked TEST fixture. No controller, release, provider or install entrypoint.
const BASE = 'd6f23bd33b0922c13e44cecde5a059b0c09235b7';
const MISSING = '20261001220000_reader_summary_first_publication_finite_contract';
const HISTORICAL = {
  sha: 'dee89140b73c9246a24b2bc094f5555a499868a0',
  image_id: 'sha256:913a68dcdc346c166e8f721ae7c81e7da949686f5ac71a41792794c36eb9cda2',
  manifest_digest: 'sha256:80e1ae707f422a121327693fc54b2c91e6b02702523919d3c2d07664c3f3fc19',
  config_digest: 'sha256:ef81578690a4951129deda5447984df4a9f01358b8bfdc4b1c2b72f39000f780',
  archive_sha256: 'sha256:03da9830e98779967df7ba0836e5b20df9f6abddb86919c355f8b0afef67b5b6',
  archive_bytes: 934976000,
} as const;
const OWNER = 'social_monitor_reader_summary_publication_owner';
const FUNCTIONS = ['assert', 'reserve', 'lock', 'observe'].map(v =>
  v + '_reader_summary_first_publication' + (v === 'assert' ? '_scope' : v === 'lock' ? '_dataset' : ''));
const SIGNATURE = '(uuid,uuid,timestamptz,timestamptz,timestamptz)';
interface Result { code: number | null; stdout: string; stderr: string }
interface Resource {
  kind: 'container' | 'network' | 'volume'; role: string; name: string; id: string | null;
  image: string | null; reference: string | null; pending: boolean; cleaned: boolean;
}
interface Plan {
  version: number; first_migrations: string[]; bootstrap_hashes: Record<string, string>;
  bootstrap_files: Record<string, string>; roles_sql: string; historical_create_sql: string;
  api_environment: Record<string, string>;
}
const keys = ['test-directory', 'source', 'candidate', 'acceptance', 'acceptance-sha256',
  'historical-receipt', 'historical-receipt-sha256', 'historical-archive', 'docker-host'] as const;
type Options = Record<typeof keys[number], string>;
function options(args: string[]): Options {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2), value = args[i + 1];
    need(args[i]?.startsWith('--') && key && keys.includes(key as typeof keys[number])
      && value && !Object.hasOwn(result, key), 'arguments'); result[key] = value;
  }
  need(keys.every(k => result[k]), 'arguments'); return result as Options;
}
async function json(file: string, expected?: string): Promise<unknown> {
  const before = await fileHash(file, 4_000_000);
  if (expected !== undefined) need(DIGEST.test(expected) && before.sha256 === expected, 'receipt-hash');
  const bytes = await readFile(file);
  need(hash(bytes) === before.sha256, 'json-changed'); return parseJson(bytes, 4_000_000);
}
async function inventory(root: string, rows: Migration[]): Promise<void> {
  await directory(root);
  const names = (await readdir(root)).sort(), lock = names.includes('migration_lock.toml');
  need(same(names, [...rows.map(r => r.name), ...(lock ? ['migration_lock.toml'] : [])].sort()), 'sql-inventory');
  if (lock) await fileHash(path.join(root, 'migration_lock.toml'));
  for (const r of rows) {
    const dir = path.join(root, r.name); await directory(dir);
    need(same(await readdir(dir), ['migration.sql']), 'sql-unknown-file');
    need((await fileHash(path.join(dir, 'migration.sql'), 16_000_000)).sha256 === 'sha256:' + r.checksum, 'sql-checksum');
  }
}
async function run(o: Options): Promise<void> {
  const deadline = Date.now() + 1_200_000;
  let commandDeadline = deadline - 240_000;
  const root = o['test-directory']; await directory(root, true); await directory(o.source);
  const rootIdentity = await lstat(root);
  await directory(o.candidate, true);
  need((await readdir(root)).length === 0 && /^[A-Za-z0-9_./-]+$/.test(root), 'fresh-private-test-directory');
  for (const input of [o.source, o.candidate, o.acceptance, o['historical-receipt'], o['historical-archive']])
    need(input !== root && !input.startsWith(root + '/') && !root.startsWith(input + '/'), 'input-overlap');
  const host = o['docker-host'];
  need(/^unix:\/\/\/[A-Za-z0-9_./-]+\/docker\.sock$/.test(host), 'explicit-unix-daemon');
  const socket = host.slice(7);
  need(await realpath(socket) === socket && (await lstat(socket)).isSocket(), 'canonical-daemon-socket');
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: root, LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', DOCKER_CONFIG: path.join(root, 'docker-config') };
  const execute = async (program: string, args: string[], data = '', allowed = false, timeout = 60_000): Promise<Result> => {
    const budget = Math.min(timeout, commandDeadline - Date.now()); need(budget > 0, 'deadline');
    const c = spawn(program, args, { cwd: o.source, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let size = 0, overflow = false, timedOut = false; const out: Buffer[] = [], err: Buffer[] = [];
    const collect = (chunks: Buffer[]) => (b: Buffer): void => {
      size += b.length;
      if (size > 2_000_000) { overflow = true; c.kill('SIGKILL'); } else chunks.push(b);
    };
    c.stdout.on('data', collect(out)); c.stderr.on('data', collect(err)); c.stdin.on('error', () => {});
    const timer = setTimeout(() => { timedOut = true; c.kill('SIGKILL'); }, budget);
    try {
      const closed = new Promise<number | null>((resolve, reject) => { c.once('error', reject); c.once('close', resolve); });
      c.stdin.end(data); const code = await closed;
      need(!overflow && !timedOut, overflow ? 'command-output-limit' : 'command-timeout');
      need(allowed || code === 0, 'command-failed');
      return { code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() };
    } finally { clearTimeout(timer); }
  };
  const git = async (args: string[]): Promise<string> => (await execute('git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args])).stdout;
  const accepted = exact(await json(o.acceptance, o['acceptance-sha256']), ['schema', 'binding',
    'config_digest', 'archive_bytes', 'native_api_pg18_qualified', 'typed_consumer_accepted']);
  need(accepted.schema === 'social-monitor-bootstrap-candidate-acceptance-v1'
    && accepted.native_api_pg18_qualified === true && accepted.typed_consumer_accepted === true, 'candidate-not-accepted');
  const b = exact(accepted.binding, ['sha', 'ci_run_id', 'image_id', 'archive_sha256', 'manifest_sha256']);
  need(typeof b.sha === 'string' && SHA.test(b.sha) && typeof b.ci_run_id === 'string' && RUN.test(b.ci_run_id)
    && [b.image_id, b.archive_sha256, b.manifest_sha256, accepted.config_digest]
      .every(v => typeof v === 'string' && DIGEST.test(v)), 'acceptance-binding');
  const binding = b as unknown as Binding, m = await artifacts(o.candidate, binding);
  need(m.migrations.length === 103 && m.migrations.filter(r => r.name === MISSING).length === 1
    && m.image_graph.config_digest === accepted.config_digest && m.archive_bytes === accepted.archive_bytes, 'candidate-contract');
  const historicalRows = m.migrations.filter(r => r.name !== MISSING);
  need(same((await readdir(o.candidate)).sort(), ['candidate.tar', 'candidate.tar.sha256', 'manifest.json',
    'phases.json', 'image-id.txt', 'source-sha.txt'].sort()), 'candidate-files');
  const phases = exact(await json(path.join(o.candidate, 'phases.json')), ['version', 'sha', 'ci_run_id',
    'phase', 'image_id', 'archive_sha256', 'archive_bytes', 'manifest_sha256', 'runtime_proof']);
  need(phases.version === 2 && phases.phase === 'qualified' && phases.archive_bytes === m.archive_bytes, 'candidate-phase');
  for (const k of Object.keys(binding)) need(phases[k] === b[k], 'phase-binding');
  proof(phases.runtime_proof, binding, String(object(phases.runtime_proof).daemon_id), m);
  for (const [name, expected] of [['source-sha.txt', binding.sha + '\n'], ['image-id.txt', binding.image_id + '\n'],
    ['candidate.tar.sha256', binding.archive_sha256.slice(7) + '  candidate.tar\n']]) {
    need(name && expected, 'sidecar'); await fileHash(path.join(o.candidate, name));
    need((await readFile(path.join(o.candidate, name), 'utf8')) === expected, 'candidate-sidecar');
  }
  const h = exact(await json(o['historical-receipt'], o['historical-receipt-sha256']), ['schema', ...Object.keys(HISTORICAL),
    'platform', 'source_label', 'root_verified', 'attestation_graph_verified', 'layers']);
  for (const [k, v] of Object.entries(HISTORICAL)) need(h[k] === v, 'historical-frozen-binding');
  need(h.schema === 'social-monitor-historical-test-receipt-v1' && h.platform === 'linux/amd64'
    && h.source_label === HISTORICAL.sha && h.root_verified === true && h.attestation_graph_verified === true, 'historical-receipt');
  const layers = array(h.layers).map(v => {
    const l = exact(v, ['compressed_digest', 'diff_id']);
    need([l.compressed_digest, l.diff_id].every(v => typeof v === 'string' && DIGEST.test(v)), 'historical-layer'); return l;
  });
  need(layers.length === 20, 'historical-layer-count');
  const oldArchive = await fileHash(o['historical-archive'], 10_000_000_000);
  need(oldArchive.sha256 === HISTORICAL.archive_sha256 && oldArchive.bytes === HISTORICAL.archive_bytes, 'historical-export');
  need((await git(['rev-parse', '--verify', 'HEAD^{commit}'])).trim() === binding.sha
    && !(await git(['status', '--porcelain', '--untracked-files=all'])).trim(), 'exact-clean-candidate-checkout');
  await inventory(path.join(o.source, 'prisma/migrations'), m.migrations);
  const tracked = (await git(['ls-files', 'prisma/migrations'])).trim().split('\n');
  const expectedTracked = m.migrations.map(r => 'prisma/migrations/' + r.name + '/migration.sql');
  if (tracked.includes('prisma/migrations/migration_lock.toml')) expectedTracked.push('prisma/migrations/migration_lock.toml');
  need(same(tracked.sort(), expectedTracked.sort()), 'tracked-migrations');
  const recipe = path.join(o.source, 'ops/ci/release-database-plan.py');
  need((await fileHash(recipe)).sha256 === hash(await git(['show', BASE + ':ops/ci/release-database-plan.py'])), 'frozen-database-recipe');
  const bootstrapSources = ['ops/deploy/reader-summary-publication-pre-migration.sql',
    'ops/deploy/reader-summary-publication-post-migration.sql', 'scripts/sql/reader-summary-publication-tenant-ownership.sql'];
  const bootstrapHashes: Record<string, string> = {};
  for (const relative of bootstrapSources) {
    const expected = hash(await git(['show', BASE + ':' + relative]));
    need((await fileHash(path.join(o.source, relative), 16_000_000)).sha256 === expected, 'bootstrap-prerequisite');
    bootstrapHashes[path.basename(relative)] = expected;
  }
  // Read-only prerequisite checks precede every Docker mutation. Images must already be loaded.
  await mkdir(env.DOCKER_CONFIG, { mode: 0o700 });
  const raw = async (args: string[], data = '', allowed = false, timeout = 60_000): Promise<Result> => {
    await directory(root, true); await directory(env.DOCKER_CONFIG, true);
    const now = await lstat(root);
    need(now.ino === rootIdentity.ino && now.dev === rootIdentity.dev
      && (await readdir(env.DOCKER_CONFIG)).length === 0, 'private-runtime-directory-changed');
    return execute('docker', ['--config', env.DOCKER_CONFIG, '--host', host, ...args], data, allowed, timeout);
  };
  const daemon = async (): Promise<string> => {
    const v = object(parseJson(Buffer.from((await raw(['version', '--format', '{{json .Server}}'])).stdout)));
    const i = object(parseJson(Buffer.from((await raw(['info', '--format', '{{json .}}'])).stdout)));
    need(typeof v.Version === 'string' && /^29\./.test(v.Version) && i.OSType === 'linux'
      && ['amd64', 'x86_64'].includes(String(i.Architecture))
      && array(i.DriverStatus).some(v => same(v, ['driver-type', 'io.containerd.snapshotter.v1'])) && typeof i.ID === 'string'
      && /^[A-Za-z0-9:_-]{8,128}$/.test(i.ID), 'docker29-linux-amd64'); return i.ID;
  };
  const daemonId = await daemon();
  const docker = async (args: string[], data = '', allowed = false, timeout = 60_000): Promise<Result> => {
    need(await daemon() === daemonId, 'daemon-changed'); return raw(args, data, allowed, timeout);
  };
  const dockerJson = async (args: string[]): Promise<Row> => {
    const rows = array(parseJson(Buffer.from((await docker(args)).stdout)));
    need(rows.length === 1, 'inspect-count'); return object(rows[0]);
  };
  const newImage = await dockerJson(['image', 'inspect', binding.image_id]);
  const oldImage = await dockerJson(['image', 'inspect', HISTORICAL.image_id]);
  for (const [image, sha, imageId, config, diffs] of [
    [newImage, binding.sha, binding.image_id, accepted.config_digest, m.image_graph.diff_ids],
    [oldImage, HISTORICAL.sha, HISTORICAL.image_id, HISTORICAL.config_digest, layers.map(l => l.diff_id)],
  ] as const) {
    const c = object(image.Config);
    need(image.Id === imageId && image.Os === 'linux' && image.Architecture === 'amd64'
      && object(c.Labels)['org.opencontainers.image.revision'] === sha
      && same(object(image.RootFS).Layers, diffs) && Object.keys(object(c.Volumes ?? {})).length === 0
      && DIGEST.test(String(config)), 'image-binding');
  }
  need(same(newImage.Descriptor, m.image_graph.descriptor)
    && object(newImage.Config).Labels && object(object(newImage.Config).Labels)['social-monitor.ci-run-id'] === binding.ci_run_id
    && object(oldImage.Descriptor).digest === HISTORICAL.image_id, 'image-descriptor');
  const dependencies = new Map<string, Row>();
  for (const ref of [PG, REDIS]) {
    const image = await dockerJson(['image', 'inspect', ref]);
    need(DIGEST.test(String(image.Id)) && image.Os === 'linux' && image.Architecture === 'amd64'
      && array(image.RepoDigests).includes(ref), 'preloaded-pinned-dependency'); dependencies.set(ref, image);
  }
  await execute('python3', ['-I', '-B', '-c', 'import hashlib,json,pathlib,stat']);
  const nonce = randomBytes(12).toString('hex'), resources: Resource[] = [], cases: Row[] = [];
  const state: Row = { schema: 'social-monitor-historical-bootstrap-test-v1', namespace: 'sm-bootstrap-TEST-' + nonce,
    binding, candidate_config_digest: accepted.config_digest, candidate_archive_bytes: m.archive_bytes,
    source: o.source, historical: h, acceptance_sha256: o['acceptance-sha256'], historical_receipt_sha256: o['historical-receipt-sha256'],
    daemon_id: daemonId, docker_host: host, resources, cases, cleanup_verified: false, outcome: 'pending' };
  const save = async (): Promise<void> => {
    await directory(root, true); const now = await lstat(root);
    need(now.ino === rootIdentity.ino && now.dev === rootIdentity.dev, 'private-runtime-directory-changed');
    const bytes = canonical(state) + '\n'; need(bytes.length < 4_000_000, 'evidence-size');
    const f = await open(path.join(root, 'state.pending'), 'wx', 0o600);
    try { await f.writeFile(bytes); await f.sync(); } finally { await f.close(); }
    await rename(path.join(root, 'state.pending'), path.join(root, 'proof.json'));
    const d = await open(root, 'r'); try { await d.sync(); } finally { await d.close(); }
  };
  const label = 'io.social-monitor.bootstrap-test';
  const labels = (): string[] => ['--label', label + '=' + nonce, '--label', label + '.candidate=' + binding.manifest_sha256,
    '--label', label + '.historical=' + o['historical-receipt-sha256']];
  let network: Resource | undefined, volume: Resource | undefined, pg: Resource | undefined, systemId = '';
  const inspect = async (r: Resource): Promise<Row> => {
    need(r.id && !r.cleaned, 'owned-id-required');
    const v = await dockerJson([r.kind, 'inspect', r.id]); const c = r.kind === 'container' ? object(v.Config) : v;
    const l = object(c.Labels);
    need(l[label] === nonce && l[label + '.candidate'] === binding.manifest_sha256
      && l[label + '.historical'] === o['historical-receipt-sha256']
      && (r.kind === 'volume' ? v.Name : v.Id) === r.id
      && v.Name === (r.kind === 'container' ? '/' : '') + r.name, 'foreign-resource');
    if (r.kind === 'container') {
      const hc = object(v.HostConfig), ns = object(object(v.NetworkSettings).Networks), mounts = array(v.Mounts);
      need(v.Image === r.image && c.Image === r.reference && hc.Privileged === false && hc.PublishAllPorts === false
        && !Object.keys(object(hc.PortBindings ?? {})).length && !array(hc.Binds ?? []).length
        && !array(hc.CapAdd ?? []).length && !array(hc.Devices ?? []).length
        && hc.PidMode !== 'host' && hc.IpcMode !== 'host', 'unsafe-container');
      const n = r.role.startsWith('extract') ? 'none' : network?.name;
      need(n && hc.NetworkMode === n && same(Object.keys(ns), [n]), 'foreign-network');
      if (n !== 'none') {
        need(network, 'owned-network-required'); await inspect(network);
        const endpoint = object(ns[n]);
        need(endpoint.NetworkID === network.id || endpoint.NetworkID === '' && object(v.State).Status === 'created', 'network-id');
      }
      need(r.role === 'postgres' ? mounts.length === 1 && object(mounts[0]).Type === 'volume'
        && object(mounts[0]).Name === volume?.id && object(mounts[0]).Destination === '/var/lib/postgresql'
        : mounts.every(m => r.role === 'redis' && object(m).Type === 'tmpfs' && object(m).Destination === '/data'), 'foreign-mount');
      if (r.role === 'postgres') { need(volume, 'owned-volume-required'); await inspect(volume); }
    } else need(r.kind === 'network' ? v.Internal === true && v.Driver === 'bridge'
      && !Object.keys(object(v.Options ?? {})).length : v.Driver === 'local'
      && !Object.keys(object(v.Options ?? {})).length, 'unsafe-resource');
    return v;
  };
  const absent = async (r: Resource): Promise<boolean> => {
    const v = await docker([r.kind, 'inspect', r.id ?? r.name], '', true);
    if (v.code === 0) return false;
    need(v.code === 1 && v.stderr.includes(r.id ?? r.name)
      && /(?:No such (?:object|container|network|volume)|network [A-Za-z0-9_-]+ not found)/i.test(v.stderr), 'absence-not-proven'); return true;
  };
  const create = async (kind: Resource['kind'], role: string, reference: string | null = null,
    args: string[] = [], command: string[] = []): Promise<Resource> => {
    const image = reference === binding.image_id ? newImage : reference === HISTORICAL.image_id ? oldImage : dependencies.get(reference ?? '');
    const r: Resource = { kind, role, name: 'sm-bootstrap-TEST-' + nonce + '-' + role, id: null,
      image: image ? String(image.Id) : null, reference, pending: true, cleaned: false };
    resources.push(r); await save(); need(await absent(r), 'namespace-collision');
    const argv = kind === 'container' ? ['container', 'create', '--name', r.name, '--pull=never', ...labels(),
      '--network', role.startsWith('extract') ? 'none' : String(network?.name), ...args, String(reference), ...command]
      : kind === 'network' ? ['network', 'create', '--internal', '--driver', 'bridge', ...labels(), r.name]
        : ['volume', 'create', '--driver', 'local', ...labels(), r.name];
    r.id = (await docker(argv)).stdout.trim();
    need(kind === 'volume' ? r.id === r.name : ID.test(r.id), 'create-id');
    r.pending = false; await save(); await inspect(r); return r;
  };
  const exec = async (r: Resource, args: string[], data = '', allowed = false): Promise<Result> => {
    await inspect(r); return docker(['exec', '-i', String(r.id), ...args], data, allowed);
  };
  const start = async (r: Resource, attached = false): Promise<Result> => {
    await inspect(r); return docker(['container', 'start', ...(attached ? ['--attach'] : []), String(r.id)], '', attached, 300_000);
  };
  const stop = async (r: Resource): Promise<void> => { await inspect(r); await docker(['stop', '--time', '10', String(r.id)]); };
  const sql = async (query: string, db = 'e2e', user = 'postgres'): Promise<string> => {
    need(pg, 'owned-postgres-required');
    const live = (await exec(pg, ['psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      'SELECT system_identifier::text FROM pg_control_system();')).stdout.trim();
    need(/^[1-9][0-9]{0,19}$/.test(live) && live !== '7688442011877063482'
      && BigInt(live) <= 18446744073709551615n && (!systemId || systemId === live), 'test-pg-system-id');
    systemId = live; state.postgres_system_identifier = live;
    need(db === 'e2e' || db === 'e2e_restore', 'test-database');
    return (await exec(pg, ['psql', '-XqAt', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1',
      '-v', 'runtime_role=e2e_api', '-v', 'system_runtime_role=e2e_system'], query)).stdout.trim();
  };
  const history = async (rows: Migration[], db = 'e2e', retries = 0): Promise<void> => {
    const all = array(parseJson(Buffer.from(await sql(`SELECT coalesce(json_agg(json_build_object('name',migration_name,
      'checksum',checksum,'finished',finished_at IS NOT NULL,'rollback',rolled_back_at IS NOT NULL)
      ORDER BY migration_name,started_at),'[]'::json) FROM public."_prisma_migrations";`, db)))).map(object);
    need(same(all.filter(r => r.finished === true && r.rollback === false).map(r => ({ name: r.name, checksum: r.checksum })), rows)
      && all.length === rows.length + retries && all.filter(r => r.rollback === true).length === retries
      && all.filter(r => r.rollback === true).every(r => r.name === MISSING && r.finished === false
        && r.checksum === m.migrations.find(r => r.name === MISSING)?.checksum), 'actual-history');
    cases.push({ case: 'history-' + db, count: rows.length, retries, history_sha256: hash(canonical(all)) }); await save();
  };
  const catalog = async (db = 'e2e'): Promise<Row> => object(parseJson(Buffer.from(await sql(CATALOG, db))));
  const record = async (name: string, detail: Row): Promise<void> => { cases.push({ case: name, ...detail }); await save(); };
  let failure: string | null = null;
  try {
    network = await create('network', 'network'); volume = await create('volume', 'pgdata');
    const extract = async (role: string, ref: string, rows: Migration[]): Promise<string> => {
      const r = await create('container', role, ref, ['--entrypoint', '/usr/bin/true']);
      const dest = path.join(root, role); await mkdir(dest, { mode: 0o755 }); await inspect(r);
      need(object((await inspect(r)).State).Status === 'created', 'extract-must-never-start');
      await docker(['cp', r.id + ':/app/prisma/migrations/.', dest]); await inventory(dest, rows); return dest;
    };
    const extracted = await extract('extract-candidate', binding.image_id, m.migrations);
    const historicalExtracted = await extract('extract-historical', HISTORICAL.image_id, historicalRows);
    const lockFile = 'migration_lock.toml';
    const hasLock = (await readdir(extracted)).includes(lockFile);
    need(hasLock === (await readdir(historicalExtracted)).includes(lockFile), 'historical-migration-lock-presence');
    if (hasLock) need((await fileHash(path.join(extracted, lockFile))).sha256
      === (await fileHash(path.join(historicalExtracted, lockFile))).sha256, 'historical-migration-lock');
    const initial = path.join(root, 'initial');
    const p = exact(parseJson(Buffer.from((await execute('python3', ['-I', '-B', recipe, '--manifest',
      path.join(o.candidate, 'manifest.json'), '--source', o.source, '--extracted', extracted, '--initial', initial])).stdout)),
    ['version', 'first_migrations', 'bootstrap_hashes', 'bootstrap_files', 'roles_sql', 'historical_create_sql', 'api_environment']) as unknown as Plan;
    need(p.version === 1 && p.first_migrations.length === 10 && p.roles_sql.length < 16_000
      && p.historical_create_sql.length < 2000 && Object.keys(p.api_environment).length < 100
      && p.api_environment.MONITORING_PERSISTENCE === 'prisma'
      && p.api_environment.SOCIAL_MONITOR_RUNTIME_PROFILE === 'deterministic-test', 'recipe-contract');
    exact(p.bootstrap_files, Object.keys(bootstrapHashes)); exact(p.bootstrap_hashes, Object.keys(bootstrapHashes));
    const stagedBootstrap = path.join(root, 'bootstrap'); await mkdir(stagedBootstrap, { mode: 0o700 });
    for (const relative of bootstrapSources) {
      const name = path.basename(relative), original = p.bootstrap_files[name], expected = bootstrapHashes[name];
      need(original === path.join(o.source, relative) && expected && 'sha256:' + p.bootstrap_hashes[name] === expected
        && (await fileHash(original, 16_000_000)).sha256 === expected, 'bootstrap-checksum');
      const target = path.join(stagedBootstrap, name); await copyFile(original, target); await chmod(target, 0o444);
      need((await fileHash(target, 16_000_000)).sha256 === expected, 'bootstrap-copy');
    }
    pg = await create('container', 'postgres', PG, ['--network-alias', 'postgres', '--mount',
      'type=volume,source=' + volume.id + ',target=/var/lib/postgresql', '-e', 'POSTGRES_DB=e2e',
      '-e', 'POSTGRES_PASSWORD=synthetic-e2e-only', '-e', 'PGDATA=/var/lib/postgresql/18/docker',
      '-e', 'POSTGRES_INITDB_ARGS=--auth-local=trust --auth-host=scram-sha-256']);
    const redis = await create('container', 'redis', REDIS, ['--network-alias', 'redis', '--tmpfs', '/data:rw,nosuid,nodev,size=16777216'],
      ['redis-server', '--save', '', '--appendonly', 'no']);
    await start(pg); await start(redis);
    let pgReady = false;
    for (let i = 0; i < 60; i++) {
      if ((await exec(pg, ['pg_isready', '-U', 'postgres', '-d', 'e2e'], '', true)).code === 0) { pgReady = true; break; } await delay(1000);
    }
    need(pgReady && /^18[0-9]{4}$/.test(await sql('SHOW server_version_num;')), 'postgres18-required');
    await sql(p.roles_sql);
    const prisma = async (role: string, ref: string, command: string[], first = false): Promise<Result> => {
      await sql('SELECT 1;');
      const r = await create('container', role, ref, ['--user', '0:0', '--entrypoint', first ? '/bin/sh' : '/app/node_modules/.bin/prisma',
        '-e', 'DATABASE_URL=postgresql://' + (first ? 'e2e_api' : 'sm_e2e_migrator') + ':synthetic-e2e-only@postgres:5432/e2e'], first
        ? ['-ec', 'rm -rf /app/prisma/migrations; cp -r /tmp/initial /app/prisma/migrations; exec /app/node_modules/.bin/prisma migrate deploy'] : command);
      if (first) { await inspect(r); await docker(['cp', initial, r.id + ':/tmp/initial']); }
      const result = await start(r, true), s = object((await inspect(r)).State);
      need(s.Running === false && typeof s.ExitCode === 'number', 'prisma-exit-state');
      return { ...result, code: s.ExitCode };
    };
    need((await prisma('first10', HISTORICAL.image_id, [], true)).code === 0, 'first10-failed');
    await directory(stagedBootstrap, true);
    need(same((await readdir(stagedBootstrap)).sort(), Object.keys(bootstrapHashes).sort()), 'bootstrap-inventory');
    for (const name of Object.keys(bootstrapHashes))
      need((await fileHash(path.join(stagedBootstrap, name), 16_000_000)).sha256 === bootstrapHashes[name], 'bootstrap-copy-changed');
    await exec(pg, ['mkdir', '-p', '/tmp/sm-e2e-bootstrap']); await inspect(pg);
    await docker(['cp', stagedBootstrap + '/.', pg.id + ':/tmp/sm-e2e-bootstrap']);
    const bootstrap = async (phase: 'pre' | 'post'): Promise<void> => {
      need(pg, 'owned-postgres-required'); await sql('SELECT 1;');
      await exec(pg, ['psql', '-XqAt', '-U', 'sm_e2e_migrator', '-d', 'e2e', '-v', 'ON_ERROR_STOP=1',
        '-v', 'runtime_role=e2e_api', '-v', 'system_runtime_role=e2e_system',
        '-f', '/tmp/sm-e2e-bootstrap/reader-summary-publication-' + phase + '-migration.sql']);
    };
    await bootstrap('pre'); await sql(p.historical_create_sql, 'e2e', 'sm_e2e_migrator');
    need((await prisma('historical102', HISTORICAL.image_id, ['migrate', 'deploy'])).code === 0, 'historical102-failed');
    await bootstrap('post'); await history(historicalRows);
    const api = async (name: string, ref: string, db = 'e2e'): Promise<Resource> => {
      await sql('SELECT 1;', db);
      const apiEnv = { ...p.api_environment, DATABASE_URL: 'postgresql://e2e_api:synthetic-e2e-only@postgres:5432/' + db };
      const r = await create('container', name, ref, Object.entries(apiEnv).flatMap(([k, v]) => ['-e', k + '=' + v]));
      await start(r); return r;
    };
    const apiStamps = new Map<string, Row>();
    const probe = async (r: Resource, name: string): Promise<void> => {
      const stamp = async (): Promise<Row> => { const v = await inspect(r), s = object(v.State);
        need(s.Running === true && typeof s.StartedAt === 'string' && !s.StartedAt.startsWith('0001-'), 'api-not-running');
        return { id: v.Id, image: v.Image, started_at: s.StartedAt }; };
      const before = await stamp(); let ok = false;
      if (apiStamps.has(r.name)) need(same(apiStamps.get(r.name), before), 'historical-api-restarted-during-upgrade');
      apiStamps.set(r.name, before);
      for (let i = 0; i < 45; i++) {
        need(same(before, await stamp()), 'api-restarted');
        const result = await exec(r, ['/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', '/usr/local/bin/node',
          '--no-addons', '-e', HTTP], '', true);
        need(same(before, await stamp()), 'api-restarted');
        if (result.code === 0) { const v = parseJson(Buffer.from(result.stdout));
          if (object(v).http_status === 200) { ready(v); ok = true; break; } } await delay(1000);
      }
      need(ok, 'real-prisma-pool-not-ready'); await record(name, { ...before, postgres_pool_ok: true });
    };
    const old = await api('old102', HISTORICAL.image_id); await probe(old, 'historical-api-102');
    const before = await catalog();
    await exec(pg, ['pg_dump', '-U', 'postgres', '-d', 'e2e', '-Fc', '-f', '/tmp/pre103.dump']);
    const archiveList = (await exec(pg, ['pg_restore', '--list', '/tmp/pre103.dump'])).stdout;
    need(archiveList.includes('TABLE DATA public _prisma_migrations'), 'dump-restore-list');
    await inspect(pg); await docker(['cp', pg.id + ':/tmp/pre103.dump', path.join(root, 'pre103.dump')]);
    const dump = await fileHash(path.join(root, 'pre103.dump'), 256_000_000);
    need((await exec(pg, ['sha256sum', '/tmp/pre103.dump'])).stdout.split(' ')[0] === dump.sha256.slice(7), 'dump-hash');
    await record('pre103-backup', { ...dump, restore_list_sha256: hash(archiveList), catalog_sha256: hash(canonical(before)) });
    const collision = 'public.' + FUNCTIONS[0] + SIGNATURE;
    await sql('CREATE FUNCTION ' + collision + ' RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END$$; ALTER FUNCTION '
      + collision + ' OWNER TO ' + OWNER + ';');
    const failedBefore = await catalog();
    const failed = await prisma('candidate-failure', binding.image_id, ['migrate', 'deploy']);
    need(failed.code !== 0 && /42723/.test(failed.stdout + failed.stderr)
      && (failed.stdout + failed.stderr).includes(String(FUNCTIONS[0])), 'expected-real-duplicate-function-failure');
    need(same(failedBefore, await catalog()), 'failed-sql-changed-catalog-or-acl');
    await record('sql-failure-atomicity', { sqlstate: '42723', before: hash(canonical(failedBefore)), after: hash(canonical(await catalog())) });
    need((await prisma('resolve-test-retry', binding.image_id, ['migrate', 'resolve', '--rolled-back', MISSING])).code === 0, 'test-resolve-failed');
    await sql('DROP FUNCTION ' + collision + ';'); need(same(before, await catalog()), 'collision-cleanup-catalog');
    need((await prisma('candidate103', binding.image_id, ['migrate', 'deploy'])).code === 0, 'candidate103-failed');
    await history(m.migrations, 'e2e', 1);
    const after = await catalog(); need(same(before.memberships, after.memberships), 'owner-membership-widened');
    const functions = array(parseJson(Buffer.from(await sql(FINITE)))).map(object);
    need(functions.length === 4 && same(functions.map(f => f.name).sort(), [...FUNCTIONS].sort()), 'finite-functions');
    for (const f of functions) need(f.owner === OWNER && f.owner_isolated === true && same(f.config, ['search_path=pg_catalog, pg_temp'])
      && f.public_execute === false && f.other_acl === false && f.operator_execute === (f.name !== FUNCTIONS[0]), 'finite-owner-searchpath-acl');
    need(await sql(MEMBERSHIP) === 'f', 'runtime-operator-owner-membership');
    await record('finite-functions', { functions }); await probe(old, 'historical-api-103'); await stop(old);
    const candidate = await api('candidate-api', binding.image_id); await probe(candidate, 'candidate-api-103'); await stop(candidate);
    const rollback = await api('image-rollback', HISTORICAL.image_id); await probe(rollback, 'historical-image-rollback-103');
    await history(m.migrations, 'e2e', 1); await stop(rollback);
    await sql('CREATE DATABASE e2e_restore OWNER e2e_api;');
    await sql('SELECT 1;');
    need((await exec(pg, ['sha256sum', '/tmp/pre103.dump'])).stdout.split(' ')[0] === dump.sha256.slice(7), 'restore-archive-changed');
    await exec(pg, ['pg_restore', '--clean', '--if-exists', '--exit-on-error', '-U', 'postgres', '-d', 'e2e_restore', '/tmp/pre103.dump']);
    await history(historicalRows, 'e2e_restore'); need(same(before, await catalog('e2e_restore')), 'restore-pre103-catalog');
    const restored = await api('restored-old-api', HISTORICAL.image_id, 'e2e_restore'); await probe(restored, 'restored-historical-api-102');
    await record('restore-pre103', { catalog_sha256: hash(canonical(await catalog('e2e_restore'))), dump_sha256: dump.sha256 });
    await artifacts(o.candidate, binding); await json(o.acceptance, o['acceptance-sha256']);
    await json(o['historical-receipt'], o['historical-receipt-sha256']); need(Date.now() < commandDeadline, 'deadline'); state.outcome = 'cases-passed';
  } catch (e) { failure = reason(e); state.outcome = 'failed'; state.failure = failure; }
  finally {
    commandDeadline = deadline; const errors: string[] = [];
    for (const r of [...resources].reverse()) {
      if (r.pending || !r.id) { errors.push('unresolved-create-' + r.role); continue; }
      try {
        if (!await absent(r)) { await inspect(r); await docker([r.kind, 'rm', ...(r.kind === 'container' ? ['-f'] : []), r.id]); }
        need(await absent(r), 'cleanup-retained'); r.cleaned = true; await save();
      } catch { errors.push('retained-' + r.role); }
    }
    state.cleanup_errors = errors; state.cleanup_verified = errors.length === 0;
    if (errors.length) { state.outcome = 'failed'; failure = 'cleanup-incomplete'; }
    if (Date.now() >= deadline) { state.outcome = 'failed'; failure = 'deadline'; }
    await save();
    if (Date.now() >= deadline) {
      state.outcome = 'failed'; state.failure = 'deadline'; failure = 'deadline';
      await save();
    }
  }
  need(failure === null && state.cleanup_verified === true, failure ?? 'incomplete');
  process.stdout.write(canonical({ proof: path.join(root, 'proof.json'), scope: 'historical-api-schema-backup-restore-TEST', cleanup_verified: true }) + '\n');
}
const HTTP = `const http=require('node:http');let size=0;const r=http.get('http://127.0.0.1:3000/ready',
res=>{const b=[];res.on('data',v=>{size+=v.length;if(size>262144)process.exit(2);b.push(v)});
res.on('end',()=>{try{console.log(JSON.stringify({http_status:res.statusCode,body:JSON.parse(Buffer.concat(b))}))}catch{process.exit(3)}})});
r.setTimeout(5000,()=>r.destroy());r.on('error',()=>process.exit(4));setTimeout(()=>process.exit(5),7000).unref();`;
// Stable names instead of OIDs let a separately restored database be compared.
const CATALOG = `SELECT json_build_object(
'schema',(SELECT json_agg(json_build_array(nspname,nspowner::regrole::text,(SELECT array_agg(x::text ORDER BY x::text) FROM unnest(nspacl)x)) ORDER BY nspname) FROM pg_namespace WHERE nspname='public'),
'relations',(SELECT json_agg(json_build_array(relname,relkind,relowner::regrole::text,(SELECT array_agg(x::text ORDER BY x::text) FROM unnest(relacl)x)) ORDER BY relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
'columns',(SELECT json_agg(json_build_array(c.relname,a.attname,(SELECT array_agg(x::text ORDER BY x::text) FROM unnest(a.attacl)x)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped),
'functions',(SELECT json_agg(json_build_array(proname,pg_get_function_identity_arguments(p.oid),proowner::regrole::text,(SELECT array_agg(x::text ORDER BY x::text) FROM unnest(proacl)x),proconfig,pg_get_functiondef(p.oid)) ORDER BY proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')),
'defaults',(SELECT json_agg(json_build_array(defaclrole::regrole::text,n.nspname,defaclobjtype,(SELECT array_agg(x::text ORDER BY x::text) FROM unnest(defaclacl)x)) ORDER BY defaclrole::regrole::text,n.nspname,defaclobjtype) FROM pg_default_acl a LEFT JOIN pg_namespace n ON n.oid=a.defaclnamespace),
'memberships',(SELECT json_agg(json_build_array(roleid::regrole::text,member::regrole::text,grantor::regrole::text,admin_option,inherit_option,set_option) ORDER BY roleid::regrole::text,member::regrole::text,grantor::regrole::text) FROM pg_auth_members));`;
const FINITE = `SELECT json_agg(json_build_object('name',p.proname,'owner',p.proowner::regrole::text,'config',p.proconfig,
'owner_isolated',(SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE oid=p.proowner),
'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0),
'operator_execute',has_function_privilege('social_monitor_summary_once',p.oid,'EXECUTE'),
'other_acl',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type<>'EXECUTE' OR a.is_grantable OR a.grantee NOT IN (p.proowner,'social_monitor_summary_once'::regrole))) ORDER BY p.proname)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (${FUNCTIONS.map(v => "'" + v + "'").join(',')}) AND p.proargtypes='2950 2950 1184 1184 1184'::oidvector;`;
const MEMBERSHIP = `SELECT EXISTS(SELECT 1 FROM unnest(ARRAY['e2e_api','e2e_system','social_monitor_summary_once','social_monitor_reader_summary_daily_terminal']) r CROSS JOIN unnest(ARRAY['${OWNER}','social_monitor_public_schema_owner']) o WHERE pg_has_role(r,o,'MEMBER'));`;
function reason(e: unknown): string { return e instanceof Error && /^[a-z0-9-]{1,100}$/.test(e.message) ? e.message : 'unclassified'; }
Promise.resolve().then(() => run(options(process.argv.slice(2)))).catch((e: unknown) => {
  process.stderr.write('historical-bootstrap-test: ' + reason(e) + '\n'); process.exitCode = 1;
});
