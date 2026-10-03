import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export const REPOSITORY = '777genius/social-monitor';
export const CI_PATH = '.github/workflows/pull-request.yml';
export const CI_NAME = 'Pull request checks';
export const SHA = /^[0-9a-f]{40}$/u;
export const RUN = /^[1-9][0-9]{0,14}$/u;
export const DIGEST = /^sha256:[0-9a-f]{64}$/u;
export const JOBS = Object.freeze([
  'Static architecture and quality', 'Security and public contracts',
  'Backend unit shard 1/4', 'Backend unit shard 2/4',
  'Backend unit shard 3/4', 'Backend unit shard 4/4',
  'Backend build and sandbox contracts', 'Backend build and unit tests',
  'Backend end-to-end tests', 'PostgreSQL tenant isolation',
  'Reader Promotion V2 canary PostgreSQL 18',
  'Feed promotion snapshot and native plans PostgreSQL 18',
  'Reader-summary weekly review manifest PostgreSQL 18',
  'Reader Value V3 PostgreSQL 18 contracts',
  'Production container and deploy lifecycle', 'Flutter architecture and tests',
]);
export class AuthorityError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function requireValue(ok: unknown, code: string): asserts ok {
  if (!ok) throw new AuthorityError(code);
}
export function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'object');
  return value as Record<string, unknown>;
}
export function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const result = object(value);
  requireValue(Object.keys(result).sort().join(',') === [...keys].sort().join(','), 'fields');
  return result;
}
export function id(value: unknown): string {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value)
    && RUN.test(String(value)), 'numeric-id');
  return String(value);
}
export function text(value: unknown, pattern: RegExp, code: string): string {
  requireValue(typeof value === 'string' && pattern.test(value), code);
  return value;
}
export function parseJson(bytes: Buffer, limit = 16 * 1024 * 1024): unknown {
  requireValue(bytes.length > 0 && bytes.length <= limit, 'json-size');
  const source = bytes.toString('utf8');
  requireValue(Buffer.from(source).equals(bytes), 'json-utf8');
  let value: unknown;
  try { value = JSON.parse(source) as unknown; }
  catch { throw new AuthorityError('json'); }
  const stack: (Set<string> | null)[] = [];
  let previous = '';
  for (const match of source.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/gu)) {
    const token = match[0];
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? new Set<string>() : null);
      requireValue(stack.length <= 64, 'json-depth');
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ':') {
      const key: unknown = JSON.parse(previous);
      const keys = stack.at(-1);
      requireValue(typeof key === 'string' && keys && !keys.has(key), 'json-keys');
      keys.add(key);
    } else if (/^-?\d/u.test(token)) requireValue(Number.isFinite(Number(token)), 'json-finite');
    previous = token;
  }
  return value;
}
export type Lane = 'skip' | 'preflight' | 'activate';
export interface Trigger { run: string; lane: Lane }
export function releaseTrigger(mode: string | undefined, event: unknown, name: string,
  actor: string, repository: string, ref: string): Trigger {
  if (!['preflight', 'manual', 'auto'].includes(mode ?? '')) return { run: '', lane: 'skip' };
  requireValue(repository === REPOSITORY, 'trigger-repository');
  const envelope = object(event);
  requireValue(object(envelope.repository).full_name === REPOSITORY, 'trigger-repository');
  if (name === 'workflow_run') {
    requireValue(envelope.action === 'completed', 'trigger-action');
    return { run: id(object(envelope.workflow_run).id), lane: mode === 'auto' ? 'activate' : 'preflight' };
  }
  requireValue(name === 'workflow_dispatch' && actor === '777genius'
    && ref === 'refs/heads/main', 'dispatch-owner');
  const inputs = object(envelope.inputs);
  requireValue(Object.keys(inputs).every(key =>
    ['ci_run_id', 'action', 'rollback_sha'].includes(key)), 'dispatch-inputs');
  const run = text(inputs.ci_run_id, RUN, 'dispatch-run');
  const action = inputs.action ?? 'preflight';
  requireValue(action === 'preflight' || action === 'activate'
    || action === 'rollback-previous', 'dispatch-action');
  if (action === 'rollback-previous') {
    text(inputs.rollback_sha, SHA, 'rollback-identity');
    throw new AuthorityError('rollback-unsupported');
  }
  requireValue(!inputs.rollback_sha, 'unexpected-rollback-identity');
  requireValue(action !== 'activate' || mode === 'manual' || mode === 'auto', 'activation-mode');
  return { run, lane: action };
}
export type Get = (suffix: string) => Promise<unknown>;
export interface Authority {
  readonly sha: string; readonly run: string; readonly attempt: number;
  readonly workflow: string; readonly jobs: readonly string[];
  readonly artifact: string; readonly artifactName: string;
  readonly artifactDigest: string; readonly artifactBytes: number;
}
export type Decision = { phase: 'stale-main-skipped'; sha: string; run: string } |
  { phase: 'ready'; authority: Authority };
function repository(value: unknown): string {
  const repo = object(value), owner = object(repo.owner);
  requireValue(repo.full_name === REPOSITORY && repo.name === 'social-monitor'
    && owner.login === '777genius', 'repository');
  return `${id(repo.id)}:${id(owner.id)}`;
}
function mainSha(value: unknown): string {
  const main = object(value), commit = object(main.object);
  requireValue(main.ref === 'refs/heads/main' && commit.type === 'commit', 'main-ref');
  return text(commit.sha, SHA, 'main-sha');
}
function legacy(value: unknown): string {
  const workflow = object(value);
  requireValue(workflow.path === '.github/workflows/production-deploy.yml'
    && workflow.state === 'disabled_manually', 'legacy-workflow');
  return id(workflow.id);
}
function ciWorkflow(value: unknown): string {
  const workflow = object(value);
  requireValue(workflow.path === CI_PATH && workflow.name === CI_NAME
    && workflow.state === 'active', 'workflow');
  return id(workflow.id);
}
function runIdentity(value: unknown, runId: string, workflow: string, repo: string) {
  const run = object(value);
  requireValue(id(run.id) === runId && id(run.workflow_id) === workflow
    && run.name === CI_NAME && run.path === CI_PATH && run.status === 'completed'
    && run.conclusion === 'success' && run.event === 'push'
    && run.head_branch === 'main', 'run-authority');
  requireValue(repository(run.repository) === repo && repository(run.head_repository) === repo, 'run-repository');
  requireValue(typeof run.run_attempt === 'number' && Number.isInteger(run.run_attempt)
    && run.run_attempt > 0 && run.run_attempt <= 1000, 'run-attempt');
  return { sha: text(run.head_sha, SHA, 'run-sha'), attempt: run.run_attempt };
}
async function pages(get: Get, path: string, key: 'jobs' | 'artifacts') {
  const result: Record<string, unknown>[] = [], ids = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 100; page++) {
    const response = exact(await get(`${path}?per_page=100&page=${page}`), ['total_count', key]);
    requireValue(typeof response.total_count === 'number' && Number.isInteger(response.total_count)
      && response.total_count > 0 && response.total_count <= 10000, 'page-total');
    requireValue(total === undefined || total === response.total_count, 'page-race');
    total = response.total_count;
    const items = response[key];
    requireValue(Array.isArray(items) && items.length > 0 && items.length <= 100, 'page-incomplete');
    for (const item of items) {
      const row = object(item), identity = id(row.id);
      requireValue(!ids.has(identity), 'page-duplicate'); ids.add(identity); result.push(row);
    }
    requireValue(result.length <= total, 'page-overflow');
    if (result.length === total) return result;
    requireValue(items.length === 100, 'page-incomplete');
  }
  throw new AuthorityError('page-limit');
}
export async function observeAuthority(get: Get, runId: string): Promise<Decision> {
  requireValue(RUN.test(runId), 'run-id');
  const repoValue = object(await get('')), repo = repository(repoValue);
  const workflow = ciWorkflow(await get('actions/workflows/pull-request.yml'));
  const initial = runIdentity(await get(`actions/runs/${runId}`), runId, workflow, repo);
  const initialMain = mainSha(await get('git/ref/heads/main'));
  const legacyId = legacy(await get('actions/workflows/production-deploy.yml'));
  const jobs = await pages(get, `actions/runs/${runId}/attempts/${initial.attempt}/jobs`, 'jobs');
  const names = new Set<string>();
  for (const job of jobs) {
    requireValue(id(job.run_id) === runId && job.run_attempt === initial.attempt
      && job.head_sha === initial.sha && job.status === 'completed'
      && job.conclusion === 'success' && typeof job.name === 'string'
      && JOBS.includes(job.name) && !names.has(job.name), 'job-authority');
    names.add(job.name);
  }
  requireValue(names.size === JOBS.length && JOBS.every(name => names.has(name)), 'jobs-missing');
  const artifacts = await pages(get, `actions/runs/${runId}/artifacts`, 'artifacts');
  const artifactName = `api-candidate-${initial.sha}-${runId}`;
  const matches = artifacts.filter(row => row.name === artifactName);
  requireValue(matches.length === 1, 'artifact-identity');
  const artifact = matches[0]; requireValue(artifact, 'artifact-identity');
  const producer = object(artifact.workflow_run);
  requireValue(id(producer.id) === runId && producer.head_sha === initial.sha
    && producer.head_branch === 'main' && id(producer.repository_id) === id(repoValue.id)
    && id(producer.head_repository_id) === id(repoValue.id) && artifact.expired === false
    && typeof artifact.size_in_bytes === 'number' && Number.isSafeInteger(artifact.size_in_bytes)
    && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 10_100_000_000, 'artifact-binding');
  const artifactId = id(artifact.id), artifactDigest = text(artifact.digest, DIGEST, 'artifact-digest');
  // Close authority observations after pagination, immediately before callers act.
  requireValue(ciWorkflow(await get('actions/workflows/pull-request.yml')) === workflow, 'workflow-race');
  const finalRun = runIdentity(await get(`actions/runs/${runId}`), runId, workflow, repo);
  requireValue(finalRun.sha === initial.sha && finalRun.attempt === initial.attempt, 'run-race');
  requireValue(legacy(await get('actions/workflows/production-deploy.yml')) === legacyId, 'legacy-race');
  const finalMain = mainSha(await get('git/ref/heads/main'));
  requireValue(initialMain === finalMain, 'main-race');
  if (initial.sha !== finalMain) return { phase: 'stale-main-skipped', sha: initial.sha, run: runId };
  return { phase: 'ready', authority: Object.freeze({
    sha: initial.sha, run: runId, attempt: initial.attempt, workflow,
    jobs: Object.freeze(jobs.map(job => id(job.id)).sort()), artifact: artifactId,
    artifactName, artifactDigest, artifactBytes: artifact.size_in_bytes,
  }) };
}
export function sameAuthority(left: Authority, right: Authority): void {
  requireValue(JSON.stringify(left) === JSON.stringify(right), 'authority-changed');
}
export function githubEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  requireValue(typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0
    && Buffer.byteLength(env.GH_TOKEN) <= 65536 && !env.GH_TOKEN.includes('\0'), 'github-token-missing');
  requireValue(typeof env.GH_CONFIG_DIR === 'string'
    && env.GH_CONFIG_DIR.length <= 4096
    && /^\/[a-zA-Z0-9_./-]+$/u.test(env.GH_CONFIG_DIR)
    && resolve(env.GH_CONFIG_DIR) === env.GH_CONFIG_DIR, 'github-private-config');
  return { PATH: '/usr/bin:/bin', LC_ALL: 'C', GH_TOKEN: env.GH_TOKEN,
    GH_CONFIG_DIR: env.GH_CONFIG_DIR, GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1', GH_PAGER: 'cat' };
}
export function githubGet(env: NodeJS.ProcessEnv): Get {
  const cleared = githubEnvironment(env);
  return async suffix => {
    requireValue(suffix === '' || /^[a-zA-Z0-9_/?=&.-]{1,256}$/u.test(suffix), 'github-endpoint');
    requireValue(!suffix.startsWith('/') && !suffix.split(/[/?]/u)
      .some(segment => segment === '.' || segment === '..'), 'github-endpoint');
    const endpoint = `repos/${REPOSITORY}${suffix ? '/' + suffix : ''}`;
    const child = spawn('/usr/bin/gh', ['api', '--hostname', 'github.com', '--method', 'GET',
      '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint],
    { shell: false, env: cleared, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = []; let size = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
    const closed = new Promise<void>((accept, reject) => {
      child.once('error', () => reject(new AuthorityError('github-unavailable')));
      child.once('close', code => code === 0 ? accept() : reject(new AuthorityError('github-unavailable')));
    });
    void closed.catch(() => {});
    try {
      for await (const chunk of child.stdout) {
        const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length;
        requireValue(size <= 16 * 1024 * 1024, 'github-bounds'); chunks.push(bytes);
      }
      await closed; return parseJson(Buffer.concat(chunks));
    } catch {
      child.kill('SIGKILL'); await closed.catch(() => {});
      throw new AuthorityError('github-observation-failed');
    } finally { clearTimeout(timer); }
  };
}
