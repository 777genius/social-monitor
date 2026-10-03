import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const A: typeof import('./hetzner-release-authority.mjs') =
  createRequire(resolve('scripts/ci/hetzner-release-authority.test.mts'))('./hetzner-release-authority.mts');
const sha = 'a'.repeat(40), other = 'b'.repeat(40), runId = '123';
type Row = Record<string, unknown>;
const names = [
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
];
function fixture() {
  const repo: Row = { id: 10, name: 'social-monitor', full_name: '777genius/social-monitor',
    owner: { id: 20, login: '777genius' } };
  const workflow: Row = { id: 30, path: '.github/workflows/pull-request.yml',
    name: 'Pull request checks', state: 'active' };
  const run: Row = { id: 123, workflow_id: 30, name: 'Pull request checks',
    path: '.github/workflows/pull-request.yml', status: 'completed', conclusion: 'success',
    event: 'push', head_branch: 'main', head_sha: sha, run_attempt: 2,
    repository: repo, head_repository: structuredClone(repo) };
  const main: Row = { ref: 'refs/heads/main', object: { type: 'commit', sha } };
  const legacy: Row = { id: 40, path: '.github/workflows/production-deploy.yml',
    state: 'disabled_manually' };
  const jobs: Row[] = names.map((name, i) => ({ id: 1000 + i, run_id: 123,
    run_attempt: 2, head_sha: sha, name, status: 'completed', conclusion: 'success' }));
  const artifacts: Row[] = [{ id: 50, name: `api-candidate-${sha}-123`, expired: false,
    size_in_bytes: 4096, digest: 'sha256:' + 'c'.repeat(64),
    workflow_run: { id: 123, head_sha: sha, head_branch: 'main',
      repository_id: 10, head_repository_id: 10 } }];
  const calls: string[] = [];
  const get: import('./hetzner-release-authority.mjs').Get = async suffix => {
    calls.push(suffix);
    if (suffix === '') return repo;
    if (suffix === 'actions/workflows/pull-request.yml') return workflow;
    if (suffix === 'actions/runs/123') return run;
    if (suffix === 'git/ref/heads/main') return main;
    if (suffix === 'actions/workflows/production-deploy.yml') return legacy;
    const match = /^actions\/runs\/123\/(?:attempts\/2\/jobs|artifacts)\?per_page=100&page=([1-9][0-9]*)$/u.exec(suffix);
    assert.ok(match, `unexpected API endpoint: ${suffix}`);
    const key = suffix.includes('/jobs?') ? 'jobs' : 'artifacts';
    const rows = key === 'jobs' ? jobs : artifacts, page = Number(match[1]);
    return { total_count: rows.length, [key]: rows.slice((page - 1) * 100, page * 100) };
  };
  return { repo, workflow, run, main, legacy, jobs, artifacts, calls, get };
}
const code = (wanted: string) => (error: unknown): boolean =>
  error instanceof A.AuthorityError && error.code === wanted;

test('public API-shaped main push with all sixteen successful jobs becomes ready', async () => {
  const f = fixture(), result = await A.observeAuthority(f.get, runId);
  assert.equal(result.phase, 'ready');
  if (result.phase !== 'ready') assert.fail('qualified main must be ready');
  assert.equal(result.authority.jobs.length, 16);
  assert.equal(result.authority.attempt, 2);
  assert.equal(result.authority.artifact, '50');
  assert.equal(f.calls.filter(path => path === 'actions/runs/123').length, 2);
  assert.ok(Object.isFrozen(result.authority) && Object.isFrozen(result.authority.jobs));
});

test('missing, duplicate, skipped and mismatched attempt/SHA/run jobs cannot authorize', async () => {
  const changes: ((f: ReturnType<typeof fixture>) => void)[] = [
    f => { f.jobs.pop(); },
    f => { f.jobs.push({ ...f.jobs[0], id: 2000 }); },
    f => { Object.assign(f.jobs[0]!, { conclusion: 'skipped' }); },
    f => { Object.assign(f.jobs[0]!, { head_sha: other }); },
    f => { Object.assign(f.jobs[0]!, { run_attempt: 1 }); },
    f => { Object.assign(f.jobs[0]!, { run_id: 124 }); },
  ];
  for (const change of changes) {
    const f = fixture(); change(f);
    await assert.rejects(A.observeAuthority(f.get, runId));
  }
});

test('fork, workflow identity, event, main branch and run identity mismatches deny', async () => {
  const changes: ((f: ReturnType<typeof fixture>) => void)[] = [
    f => { f.run.head_repository = { ...f.repo, id: 99 }; },
    f => { f.repo.owner = { id: 20, login: 'another-owner' }; },
    f => { f.workflow.id = 31; },
    f => { f.workflow.path = '.github/workflows/other.yml'; },
    f => { f.workflow.name = 'Other checks'; },
    f => { f.run.head_sha = 'short'; },
    f => { f.run.run_attempt = 0; },
    f => { f.run.event = 'pull_request'; },
    f => { f.run.head_branch = 'feature'; },
    f => { f.run.id = 124; },
    f => { f.legacy.state = 'active'; },
  ];
  for (const change of changes) {
    const f = fixture(); change(f); await assert.rejects(A.observeAuthority(f.get, runId));
  }
});

test('artifact identity, producer repository, digest, size and expiration are mandatory', async () => {
  const mutations: Row[] = [
    { name: 'api-candidate-other' }, { expired: true }, { expired: undefined },
    { size_in_bytes: 0 }, { size_in_bytes: 10_100_000_001 }, { size_in_bytes: 1.5 },
    { id: '50' }, { digest: null }, { digest: 'sha256:short' },
    ...[{ id: 124 }, { head_sha: other }, { head_branch: 'feature' },
      { repository_id: 99 }, { head_repository_id: 99 }]
      .map(change => ({ workflow_run: { id: 123, head_sha: sha, head_branch: 'main',
        repository_id: 10, head_repository_id: 10, ...change } })),
  ];
  for (const mutation of mutations) {
    const f = fixture(); Object.assign(f.artifacts[0]!, mutation);
    await assert.rejects(A.observeAuthority(f.get, runId));
  }
  const f = fixture(); f.artifacts.push({ ...f.artifacts[0], id: 51 });
  await assert.rejects(A.observeAuthority(f.get, runId), code('artifact-identity'));
});

test('exact hundred-page artifact boundary is complete; duplicate and changing pages deny', async () => {
  const f = fixture(), candidate = f.artifacts[0]!;
  f.artifacts.splice(0, 1, ...Array.from({ length: 9999 }, (_, i) =>
    ({ id: 10000 + i, name: `unrelated-${i}` })), candidate);
  assert.equal((await A.observeAuthority(f.get, runId)).phase, 'ready');
  assert.equal(f.calls.filter(path => path.includes('/artifacts?')).length, 100);
  for (const mutation of ['duplicate', 'total', 'short', 'overflow'] as const) {
    const get: import('./hetzner-release-authority.mjs').Get = async path => {
      const value = await f.get(path);
      if (!path.includes('/artifacts?')) return value;
      const page = A.object(value), rows = page.artifacts as Row[];
      if (path.endsWith('page=2') && mutation === 'duplicate') rows[0] = { ...rows[0], id: 10000 };
      if (path.endsWith('page=2') && mutation === 'total') page.total_count = 9999;
      if (path.endsWith('page=1') && mutation === 'short') rows.pop();
      if (mutation === 'overflow') page.total_count = 10001;
      return page;
    };
    await assert.rejects(A.observeAuthority(get, runId));
  }
});

test('closing observations reject main/run/workflow/legacy races; stable stale main skips', async () => {
  for (const endpoint of ['git/ref/heads/main', 'actions/runs/123',
    'actions/workflows/pull-request.yml', 'actions/workflows/production-deploy.yml']) {
    const f = fixture(); let seen = 0;
    await assert.rejects(A.observeAuthority(async path => {
      const value = await f.get(path);
      if (path !== endpoint || ++seen < 2) return value;
      if (path === 'git/ref/heads/main') return { ref: 'refs/heads/main', object: { type: 'commit', sha: other } };
      if (path === 'actions/runs/123') return { ...f.run, run_attempt: 3 };
      return { ...A.object(value), id: 999 };
    }, runId));
  }
  const f = fixture(); f.main.object = { type: 'commit', sha: other };
  assert.deepEqual(await A.observeAuthority(f.get, runId),
    { phase: 'stale-main-skipped', sha, run: runId });
});

test('mode selection precedes payload access; dispatch requires exact owner/main and explicit activation', () => {
  for (const mode of [undefined, '', 'AUTO', 'unknown'])
    assert.deepEqual(A.releaseTrigger(mode, null, '', '', '', ''), { run: '', lane: 'skip' });
  const event = { repository: { full_name: '777genius/social-monitor' },
    inputs: { ci_run_id: runId, action: 'activate' } };
  const dispatch = (mode: string, actor = '777genius', ref = 'refs/heads/main') =>
    A.releaseTrigger(mode, event, 'workflow_dispatch', actor, '777genius/social-monitor', ref);
  assert.deepEqual(dispatch('manual'), { run: runId, lane: 'activate' });
  assert.throws(() => dispatch('preflight'), code('activation-mode'));
  assert.throws(() => dispatch('manual', 'other'), code('dispatch-owner'));
  assert.throws(() => dispatch('manual', '777genius', 'refs/heads/feature'), code('dispatch-owner'));
  const automatic = { repository: event.repository, action: 'completed',
    workflow_run: { id: 123, event: 'push', head_branch: 'main', conclusion: 'success' } };
  for (const mode of ['preflight', 'manual', 'auto'])
    assert.equal(A.releaseTrigger(mode, automatic, 'workflow_run', '', '777genius/social-monitor', '').lane,
      mode === 'auto' ? 'activate' : 'preflight');
  assert.throws(() => A.releaseTrigger('manual', { ...event, inputs: {
    ci_run_id: runId, action: 'rollback-previous', rollback_sha: sha } },
  'workflow_dispatch', '777genius', '777genius/social-monitor', 'refs/heads/main'), code('rollback-unsupported'));
});

test('completed workflow payloads only select eligible runs; ineligible runs skip before ID parsing', async () => {
  const run: Row = { id: 123, event: 'push', head_branch: 'main', conclusion: 'success' };
  const event = { repository: { full_name: A.REPOSITORY }, action: 'completed', workflow_run: run };
  const trigger = (value: unknown) =>
    A.releaseTrigger('auto', value, 'workflow_run', '', A.REPOSITORY, '');
  for (const change of [{ event: 'pull_request' }, { conclusion: 'failure' },
    { conclusion: 'cancelled' }, { head_branch: 'feature' }, { event: undefined },
    { head_branch: undefined }, { conclusion: undefined }]) {
    assert.deepEqual(trigger({ ...event, workflow_run: { ...run, ...change, id: 'invalid' } }),
      { run: '', lane: 'skip' });
  }
  for (const invalid of [undefined, '123', 0, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => trigger({ ...event, workflow_run: { ...run, id: invalid } }), code('numeric-id'));
  assert.throws(() => trigger({ ...event, action: 'requested' }), code('trigger-action'));
  assert.throws(() => trigger({ ...event, repository: { full_name: 'other/repo' } }),
    code('trigger-repository'));
  const selected = trigger(event);
  assert.deepEqual(selected, { run: runId, lane: 'activate' });
  for (const change of [{ event: 'pull_request' }, { conclusion: 'failure' },
    { conclusion: 'cancelled' }, { head_branch: 'feature' }]) {
    const f = fixture(); Object.assign(f.run, change);
    await assert.rejects(A.observeAuthority(f.get, selected.run), code('run-authority'));
    assert.deepEqual(f.calls, ['', 'actions/workflows/pull-request.yml', 'actions/runs/123']);
  }
});

test('JSON duplicate keys, excessive depth, invalid UTF-8, overflow and size cannot be evidence', async () => {
  for (const source of ['{"a":1,"\\u0061":2}', '{"nested":[1e999]}', '['.repeat(65) + '0' + ']'.repeat(65)])
    assert.throws(() => A.parseJson(Buffer.from(source)));
  assert.throws(() => A.parseJson(Buffer.from([0xff])));
  assert.throws(() => A.parseJson(Buffer.from('{}'), 1), code('json-size'));
  assert.deepEqual(A.parseJson(Buffer.from('{"ns":1750000000123456789}')), { ns: Number('1750000000123456789') });
  const env = { GH_TOKEN: 'fixture-not-a-credential', GH_CONFIG_DIR: '/tmp/hetzner-fixture',
    BASH_ENV: '/untrusted', NODE_OPTIONS: '--untrusted', PATH: '/untrusted', HOME: '/untrusted' };
  const cleared = A.githubEnvironment(env);
  assert.equal(cleared.PATH, '/usr/bin:/bin');
  for (const key of ['BASH_ENV', 'NODE_OPTIONS', 'HOME']) assert.equal(cleared[key], undefined);
  for (const change of [{ GH_TOKEN: '' }, { GH_TOKEN: 'x'.repeat(65537) },
    { GH_TOKEN: 'x\0y' }, { GH_CONFIG_DIR: '/tmp/../other' }])
    assert.throws(() => A.githubEnvironment({ ...env, ...change }));
  for (const suffix of ['../other', '/actions/runs/123', 'actions/./runs', 'x'.repeat(257)])
    await assert.rejects(A.githubGet(env)(suffix), code('github-endpoint'));
});
