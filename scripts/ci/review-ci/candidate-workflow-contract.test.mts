import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

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
type Workflow = Record<string, unknown> & { jobs: { production_runtime: Job } };
function baseline(): Workflow {
  return load(source, { schema: CORE_SCHEMA, json: false }) as Workflow;
}
function step(w: Workflow, index: number): Step {
  const value = w.jobs.production_runtime.steps[index];
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

test('resolved job drift is rejected independently of the safety checks', () => {
  const w = baseline();
  step(w, 0).name = 'Different descriptive name';
  assert.notDeepEqual(C.candidateWorkflowSourceViolations(dump(w), fragmentSource), []);
});

const mutations: [string, (w: Workflow) => void][] = [
  ['checkout revision', (w) => options(w, 0).ref = 'main'],
  ['checkout credentials', (w) => options(w, 0)['persist-credentials'] = true],
  ['shallow checkout', (w) => options(w, 0)['fetch-depth'] = 1],
  ['floating checkout action', (w) => step(w, 0).uses = 'actions/checkout@main'],
  ...['check:container', 'check:runtime-compose', 'check:production-deploy-lifecycle'].map(
    (gate): [string, (w: Workflow) => void] => [
      `missing ${gate}`, (w) => replaceRun(w, 3, `npm run ${gate}\n`, ''),
    ],
  ),
  ['duplicate build', (w) => w.jobs.production_runtime.steps.push(structuredClone(step(w, 5)))],
  ['foreign command', (w) => replaceRun(w, 5, 'set -euo pipefail', 'set -euo pipefail\ndocker build .')],
  ['foreign save', (w) => replaceRun(w, 5, 'set -euo pipefail', 'set -euo pipefail\ndocker save app')],
  ['shell substitution', (w) => replaceRun(w, 5, '"$GITHUB_SHA"', '"$(git rev-parse HEAD)"')],
  ['unbound helper SHA', (w) => replaceRun(w, 5, '"$GITHUB_SHA"', '"main"')],
  ['missing candidate file', (w) => {
    const upload = options(w, 6);
    assert.equal(typeof upload.path, 'string');
    upload.path = (upload.path as string).split('\n').filter((line) => !line.endsWith('/source-sha.txt')).join('\n');
  }],
  ['foreign candidate directory', (w) => {
    const upload = options(w, 6);
    upload.path = String(upload.path).replaceAll('${{ runner.temp }}', '${{ github.workspace }}');
  }],
  ['unbound upload name', (w) => options(w, 6).name = 'api-candidate-latest'],
  ['artifact overwrite', (w) => options(w, 6).overwrite = true],
  ['missing file tolerated', (w) => options(w, 6)['if-no-files-found'] = 'ignore'],
  ['long retention', (w) => options(w, 6)['retention-days'] = 90],
  ['job write privileges', (w) => w.jobs.production_runtime.permissions = { contents: 'write' }],
  ['workflow write privileges', (w) => w.permissions = { contents: 'write' }],
  ['deployment environment', (w) => w.jobs.production_runtime.environment = 'production'],
  ['job environment', (w) => w.jobs.production_runtime.env = { FORBIDDEN_EXTRA_ENV: 'synthetic-test-only' }],
  ['inherited shell environment', (w) => w.env = { BASH_ENV: 'startup.sh' }],
  ['workflow defaults', (w) => w.defaults = { run: { shell: 'bash {0} || true' } }],
  ['job needs', (w) => w.jobs.production_runtime.needs = ['backend_unit']],
  ['job skip', (w) => w.jobs.production_runtime.if = false],
  ['job ignored failure', (w) => w.jobs.production_runtime['continue-on-error'] = true],
  ['self-hosted runner', (w) => w.jobs.production_runtime['runs-on'] = 'self-hosted'],
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((index): [string, (w: Workflow) => void][] => [
    [`step ${index} skip`, (w) => step(w, index).if = false],
    [`step ${index} ignored failure`, (w) => step(w, index)['continue-on-error'] = true],
  ]),
  ['successful phase evidence', (w) => step(w, 7).if = 'always()'],
  ['phase evidence contains archive', (w) => options(w, 7).path = '${{ runner.temp }}/api-candidate-${{ github.run_id }}/candidate.tar'],
  ['malformed step', (w) => w.jobs.production_runtime.steps[0] = null as unknown as Step],
];

for (const [label, mutate] of mutations) {
  test(`candidate contract rejects ${label} even when both job models agree`, () => {
    const w = baseline();
    mutate(w);
    const fragment = { production_runtime: structuredClone(w.jobs.production_runtime) };
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
