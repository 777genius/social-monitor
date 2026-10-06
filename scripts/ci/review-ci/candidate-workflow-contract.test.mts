import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { CORE_SCHEMA, load, dump } = require('js-yaml') as {
  readonly CORE_SCHEMA: object;
  load(source: string, options: { schema: object; json: false }): unknown;
  dump(value: unknown): string;
};
const C: typeof import('../check-release-candidate-workflow.mjs') =
  require('../check-release-candidate-workflow.mts');
const source = readFileSync(new URL('../../../.github/workflows/pull-request.yml', import.meta.url), 'utf8');
const fragmentSource = readFileSync(new URL('../../../ops/ci/release-candidate-job.yml', import.meta.url), 'utf8');
type Step = Record<string, unknown>;
type Job = Record<string, unknown> & { steps: Step[] };
type Workflow = Record<string, unknown> & { jobs: { production_candidate: Job; production_lifecycle: Job; production_runtime: Job } };
function baseline(): Workflow {
  return load(source, { schema: CORE_SCHEMA, json: false }) as Workflow;
}
function step(w: Workflow, index: number): Step {
  const value = w.jobs.production_candidate.steps[index];
  assert.ok(value, `missing baseline step ${index}`);
  return value;
}
function options(w: Workflow, index: number): Record<string, unknown> {
  const value = step(w, index).with;
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function replaceRun(w: Workflow, index: number, before: string, after: string): void {
  const value = step(w, index);
  assert.equal(typeof value.run, 'string');
  const run = value.run as string;
  assert.ok(run.includes(before), `absent mutation target: ${before}`);
  value.run = run.replace(before, after);
}

test('actual workflow and reviewed fragment satisfy the candidate contract', () => {
  assert.deepEqual(C.candidateWorkflowSourceViolations(source, fragmentSource), []);
});

// Regression: independently hardcoded release fixtures alone would miss a
// real CI job being added/renamed without updating release authority.
test('release authority whitelist equals every expanded current workflow job exactly once', () => {
  const authority: typeof import('../hetzner-release-authority.mjs') =
    require('../hetzner-release-authority.mts');
  const workflow = baseline();
  const jobs = workflow.jobs as Record<string, Job>;
  const actual = Object.values(jobs).flatMap(job => {
    assert.equal(typeof job.name, 'string');
    if (job.strategy === undefined) return [job.name as string];
    const strategy = job.strategy as { matrix: { shard: number[] } };
    return strategy.matrix.shard.map(shard => (job.name as string).replace('${{ matrix.shard }}', String(shard)));
  });
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual.sort(), [...authority.JOBS].sort());
});

test('resolved job drift is rejected independently of the safety checks', () => {
  const w = baseline();
  step(w, 0).name = 'Different descriptive name';
  assert.notDeepEqual(C.candidateWorkflowSourceViolations(dump(w), fragmentSource), []);
});

const mutations: [string, (w: Workflow) => void][] = [
  ...(['production_candidate', 'production_lifecycle', 'production_runtime'] as const).flatMap(
    (id): [string, (w: Workflow) => void][] => [
      [`missing ${id}`, (w) => delete (w.jobs as Record<string, Job>)[id]],
      [`${id} failure ignored`, (w) => w.jobs[id]['continue-on-error'] = true],
      [`${id} skipped`, (w) => w.jobs[id].if = false],
      [`${id} self-hosted`, (w) => w.jobs[id]['runs-on'] = 'self-hosted'],
      [`${id} environment`, (w) => w.jobs[id].environment = 'production'],
    ],
  ),
  ['serialized children', (w) => w.jobs.production_lifecycle.needs = ['production_candidate']],
  ['lifecycle wrong SHA', (w) => (w.jobs.production_lifecycle.steps[0]!.with as Step).ref = 'main'],
  ['lifecycle failure masked', (w) => w.jobs.production_lifecycle.steps[2]!['continue-on-error'] = true],
  ['lifecycle gate skipped', (w) => w.jobs.production_lifecycle.steps[2]!.if = false],
  ['aggregate bypasses selected VM', (w) => w.jobs.production_runtime['runs-on'] = 'ubuntu-latest'],
  ['aggregate timeout drift', (w) => w.jobs.production_runtime['timeout-minutes'] = 10],
  ['aggregate heavy work added', (w) => w.jobs.production_runtime.steps.push({ name: 'Install', run: 'npm ci' })],
  ['aggregate not always', (w) => w.jobs.production_runtime.if = 'success()'],
  ['aggregate missing dependency', (w) => w.jobs.production_runtime.needs = ['production_candidate']],
  ['aggregate omitted child result', (w) => w.jobs.production_runtime.steps[0]!.run = 'set -euo pipefail\ntest "${{ needs.production_candidate.result }}" = "success"'],
  ['aggregate permits skipped/cancelled children', (w) => w.jobs.production_runtime.steps[0]!.run = String(w.jobs.production_runtime.steps[0]!.run).replaceAll('= "success"', '!= "failure"')],
  ['unqualified upload', (w) => step(w, 5).if = 'always()'],
  ['qualification omitted', (w) => w.jobs.production_candidate.steps.splice(4, 1)],
  ['checkout revision', (w) => options(w, 0).ref = 'main'],
  ['checkout credentials', (w) => options(w, 0)['persist-credentials'] = true],
  ['shallow checkout', (w) => options(w, 0)['fetch-depth'] = 1],
  ['floating checkout action', (w) => step(w, 0).uses = 'actions/checkout@main'],
  ...['check:container', 'check:runtime-compose', 'check:production-deploy-lifecycle'].map(
    (gate): [string, (w: Workflow) => void] => [
      `missing ${gate}`, (w) => w.jobs.production_lifecycle.steps[2]!.run = String(w.jobs.production_lifecycle.steps[2]!.run).replace(`npm run ${gate}\n`, ''),
    ],
  ),
  ['duplicate build', (w) => w.jobs.production_candidate.steps.push(structuredClone(step(w, 4)))],
  ['foreign command', (w) => replaceRun(w, 4, 'set -euo pipefail', 'set -euo pipefail\ndocker build .')],
  ['foreign save', (w) => replaceRun(w, 4, 'set -euo pipefail', 'set -euo pipefail\ndocker save app')],
  ['shell substitution', (w) => replaceRun(w, 4, '"$GITHUB_SHA"', '"$(git rev-parse HEAD)"')],
  ['unbound helper SHA', (w) => replaceRun(w, 4, '"$GITHUB_SHA"', '"main"')],
  ['missing candidate file', (w) => {
    const upload = options(w, 5);
    assert.equal(typeof upload.path, 'string');
    upload.path = (upload.path as string).split('\n').filter((line) => !line.endsWith('/source-sha.txt')).join('\n');
  }],
  ['foreign candidate directory', (w) => {
    const upload = options(w, 5);
    upload.path = String(upload.path).replaceAll('${{ runner.temp }}', '${{ github.workspace }}');
  }],
  ['unbound upload name', (w) => options(w, 5).name = 'api-candidate-latest'],
  ['artifact overwrite', (w) => options(w, 5).overwrite = true],
  ['missing file tolerated', (w) => options(w, 5)['if-no-files-found'] = 'ignore'],
  ['long retention', (w) => options(w, 5)['retention-days'] = 90],
  ['producer in another job', (w) => (w.jobs as Record<string, Job>).extra = { steps: [structuredClone(step(w, 4))] }],
  ['candidate upload in another job', (w) => (w.jobs as Record<string, Job>).extra = { steps: [structuredClone(step(w, 5))] }],
  ['job write privileges', (w) => w.jobs.production_candidate.permissions = { contents: 'write' }],
  ['workflow write privileges', (w) => w.permissions = { contents: 'write' }],
  ['deployment environment', (w) => w.jobs.production_candidate.environment = 'production'],
  ['job environment', (w) => w.jobs.production_candidate.env = { FORBIDDEN_EXTRA_ENV: 'synthetic-test-only' }],
  ['inherited shell environment', (w) => w.env = { BASH_ENV: 'startup.sh' }],
  ['workflow defaults', (w) => w.defaults = { run: { shell: 'bash {0} || true' } }],
  ['job needs', (w) => w.jobs.production_candidate.needs = ['backend_unit']],
  ['job skip', (w) => w.jobs.production_candidate.if = false],
  ['job ignored failure', (w) => w.jobs.production_candidate['continue-on-error'] = true],
  ['self-hosted runner', (w) => w.jobs.production_candidate['runs-on'] = 'self-hosted'],
  ...[0, 1, 2, 3, 4, 5].flatMap((index): [string, (w: Workflow) => void][] => [
    [`step ${index} skip`, (w) => step(w, index).if = false],
    [`step ${index} ignored failure`, (w) => step(w, index)['continue-on-error'] = true],
  ]),
  ['successful phase evidence', (w) => step(w, 6).if = 'always()'],
  ['phase evidence contains archive', (w) => options(w, 6).path = '${{ runner.temp }}/api-candidate-${{ github.run_id }}/candidate.tar'],
  ['malformed step', (w) => w.jobs.production_candidate.steps[0] = null as unknown as Step],
];

for (const [label, mutate] of mutations) {
  test(`candidate contract rejects ${label} even when both job models agree`, () => {
    const w = baseline();
    mutate(w);
    const fragment = Object.fromEntries(['production_candidate', 'production_lifecycle', 'production_runtime']
      .map((id) => [id, structuredClone(w.jobs[id as keyof Workflow['jobs']])]));
    assert.notDeepEqual(C.candidateWorkflowSourceViolations(dump(w), dump(fragment)), []);
  });
}

test('malformed YAML and unknown document shapes are rejected safely', () => {
  for (const bad of ['', 'jobs: [', `${source}\nname: duplicate\n`, 'x'.repeat(256 * 1024 + 1)]) {
    assert.notDeepEqual(C.candidateWorkflowSourceViolations(bad, fragmentSource), []);
    assert.notDeepEqual(C.candidateWorkflowSourceViolations(source, bad), []);
  }
  for (const bad of [null, false, 1, [], {}, { jobs: [] }, { jobs: { production_runtime: [] } }]) {
    assert.notDeepEqual(C.candidateWorkflowViolations(bad, {}), []);
    assert.notDeepEqual(C.candidateWorkflowViolations(baseline(), bad), []);
  }
});

// Regression: success-shaped graph syntax alone does not prove that missing,
// skipped, failed or cancelled children actually produce a failing aggregate.
test('actual aggregate shell fails closed for every nonsuccess child result', () => {
  const run = baseline().jobs.production_runtime.steps[0]!.run;
  assert.equal(typeof run, 'string');
  for (const candidate of ['success', '', 'skipped', 'failure', 'cancelled']) {
    for (const lifecycle of ['success', '', 'skipped', 'failure', 'cancelled']) {
      const script = (run as string)
        .replace('${{ needs.production_candidate.result }}', candidate)
        .replace('${{ needs.production_lifecycle.result }}', lifecycle);
      const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', timeout: 5000 });
      assert.ifError(result.error);
      assert.equal(result.status === 0, candidate === 'success' && lifecycle === 'success');
    }
  }
});

// Exercise the actual admission shell before OS/package/root operations.
// Removing the allowlist, context binding or nonroot guard makes these red.
for (const [jobId, stepName] of [
  ['static_quality', 'Verify release controller contracts'],
  ['backend_unit_shards', 'Supply genuine native PostgreSQL 18 executables'],
]) {
  test(`native admission for ${jobId} rejects untrusted runner tuples before writes`, () => {
    const jobs = (load(source, { schema: CORE_SCHEMA, json: false }) as {
      jobs: Record<string, Job>;
    }).jobs;
    const command = jobs[jobId!]!.steps.find(value => value.name === stepName)?.run;
    assert.equal(typeof command, 'string');
    const boundary = (command as string).indexOf('\n. /etc/os-release\n');
    assert.ok(boundary > 0, 'guard must precede system operations');
    const admission = (command as string).slice(0, boundary);
    assert.equal(/\b(?:sudo|apt-get|curl|docker|npm)\b/u.test(admission), false);
    const root = process.getuid?.() === 0;
    const identity = root ? { uid: 65534, gid: 65534 } : {};
    const invoke = (label: string, environment: string, context: string,
      githubActions = 'true', asRoot = false) => {
      const result = spawnSync('bash', ['-c', admission], {
        cwd: '/tmp', encoding: 'utf8', timeout: 5000,
        ...(asRoot ? {} : identity),
        env: {
          PATH: '/usr/bin:/bin', GITHUB_ACTIONS: githubActions,
          RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
          RUNNER_ENVIRONMENT: environment, CI_NATIVE_RUNNER: label,
          CI_NATIVE_ENVIRONMENT: context,
        },
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      return result.status;
    };
    assert.equal(invoke('ubuntu-24.04', 'github-hosted', 'github-hosted'), 0);
    assert.equal(invoke('ubicloud-standard-4', 'self-hosted', 'self-hosted'), 0);
    assert.notEqual(invoke('self-hosted', 'self-hosted', 'self-hosted'), 0);
    assert.notEqual(invoke('ubicloud-standard-8', 'self-hosted', 'self-hosted'), 0);
    assert.notEqual(invoke('ubuntu-24.04', 'self-hosted', 'self-hosted'), 0);
    assert.notEqual(invoke('ubicloud-standard-4', 'self-hosted', 'github-hosted'), 0);
    assert.notEqual(invoke('ubicloud-standard-4', 'github-hosted', 'self-hosted'), 0);
    assert.notEqual(invoke('', 'self-hosted', 'self-hosted'), 0);
    assert.notEqual(invoke('ubicloud-standard-4', 'self-hosted', 'self-hosted', 'false'), 0);
    if (root) assert.notEqual(invoke('ubicloud-standard-4', 'self-hosted', 'self-hosted', 'true', true), 0);
  });
}
