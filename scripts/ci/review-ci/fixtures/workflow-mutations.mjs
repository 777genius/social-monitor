// Each label states the CI regression the mutated workflow must reject.
export const unitMutations = [
  ['missing shard', (w) => w.jobs.backend_unit_shards.strategy.matrix.shard.pop()],
  ['duplicate shard', (w) => w.jobs.backend_unit_shards.strategy.matrix.shard[3] = 3],
  ['matrix exclusion silently removes shard', (w) => w.jobs.backend_unit_shards.strategy.matrix.exclude = [{ shard: 4 }]],
  ['wrong denominator', (w) => replaceRun(w, 'backend_unit_shards', '/6', '/4')],
  ...['--testPathPattern=small', '--onlyChanged', '--changedSince=main', '-t small', '--passWithNoTests', '--testPathIgnorePatterns=hidden', '--testNamePattern=small'].map((filter) =>
    [`narrowed candidate selector ${filter}`, (w) => lastRun(w, 'backend_unit_shards').run += ` ${filter}`]),
  ['subset inventory', (w) => replaceRun(w, 'backend_unit_shards', '--listTests --json', '--listTests --json --shard=${{ matrix.shard }}/6')],
  ['unit timeout removed', (w) => replaceRun(w, 'backend_unit_shards', 'node scripts/run-with-timeout.mjs --timeout-ms 2700000 --node-options --max-old-space-size=4096 -- ', '')],
  ['bare-unit memory budget restored accidentally', (w) => replaceRun(w, 'backend_unit_shards', '--max-old-space-size=4096', '--max-old-space-size=2048')],
  ['bare-unit execution deadline restored accidentally', (w) => replaceRun(w, 'backend_unit_shards', '--timeout-ms 2700000', '--timeout-ms 900000')],
  ['bare-unit job deadline restored accidentally', (w) => w.jobs.backend_unit_shards['timeout-minutes'] = 45],
  ['unbounded coverage job deadline', (w) => w.jobs.backend_unit_shards['timeout-minutes'] = 61],
  ['coverage removed', (w) => replaceRun(w, 'backend_unit_shards', '--coverage ', '')],
  ['command exit masked', (w) => lastRun(w, 'backend_unit_shards').run += ' || true'],
  ['aggregate only excludes failure', (w) => w.jobs.backend_unit.steps[0].run = w.jobs.backend_unit.steps[0].run.replace('= "success"', '!= "failure"')],
  ['aggregate command failure masked', (w) => w.jobs.backend_unit.steps[0].run += '\ntrue'],
  ['aggregate command boundaries folded into a successful set builtin', (w) => w.jobs.backend_unit.steps[0].run = w.jobs.backend_unit.steps[0].run.replaceAll('\n', ' ')],
  ['canary command boundaries folded into a successful set builtin', (w) => lastRun(w, 'backend_build_contracts').run = lastRun(w, 'backend_build_contracts').run.replaceAll('\n', ' ')],
  ['aggregate not always', (w) => w.jobs.backend_unit.if = 'success()'],
  ['contract job missing from needs', (w) => w.jobs.backend_unit.needs.pop()],
  ['shards missing from needs', (w) => w.jobs.backend_unit.needs.shift()],
  ['contract success not checked', (w) => w.jobs.backend_unit.steps[0].run = w.jobs.backend_unit.steps[0].run.split('\n').slice(0, 2).join('\n')],
  ['completeness defaults to historical four reports', (w) => replaceRun(w, 'backend_unit', ' --shards 6', '')],
  ['completeness proof removed', (w) => w.jobs.backend_unit.steps.pop()],
  ['aggregate dependencies installed', (w) => w.jobs.backend_unit.steps.push({ run: 'npm ci' })],
  ['contract moved outside aggregate closure', (w) => {
    const job = w.jobs.backend_build_contracts;
    w.jobs.unrequired_contract = { 'runs-on': 'ubuntu-latest', steps: [job.steps.splice(6, 1)[0]] };
  }],
  ['first canary failure masked by second command', (w) => lastRun(w, 'backend_build_contracts').run = lastRun(w, 'backend_build_contracts').run.replace('set -euo pipefail\n', '')],
  ['duplicate full unit execution', (w) => w.jobs.extra = { steps: [{ run: 'npm test' }] }],
  ['obsolete main SHAs keep competing', (w) => w.concurrency.group = '${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}'],
  ['different PRs share one workflow group', (w) => w.concurrency.group = '${{ github.workflow }}'],
  ['dispatch collides with push-main by ref', (w) => w.concurrency.group = '${{ github.workflow }}-${{ github.ref }}'],
  ['PR updates lose current-PR cancellation', (w) => w.concurrency.group = "${{ github.workflow }}-${{ (github.event_name == 'push' && github.ref) || github.sha }}"],
  ...['merge_group', 'workflow_dispatch'].map((event) => [
    `${event} SHAs collide by ref`, (w) => w.concurrency.group = `\${{ github.workflow }}-\${{ github.event.pull_request.number || ((github.event_name == 'push' || github.event_name == '${event}') && github.ref) || github.sha }}`,
  ]),
  ['obsolete main cancellation disabled', (w) => w.concurrency['cancel-in-progress'] = false],
  ['aggregate uses a full VM', (w) => w.jobs.backend_unit['runs-on'] = 'ubuntu-latest'],
  ['aggregate uses an arbitrary runner', (w) => w.jobs.backend_unit['runs-on'] = 'self-hosted'],
  ['aggregate exceeds its ten-minute cap', (w) => w.jobs.backend_unit['timeout-minutes'] = 15],
  ['push-main trigger omitted', (w) => delete w.on.push],
  ['push limited by path filter', (w) => w.on.push.paths = ['libs/**']],
  ['PR write permission', (w) => w.permissions['id-token'] = 'write'],
  ['shard write permission', (w) => w.jobs.backend_unit_shards.permissions = 'write-all'],
  ['inventory upload overwrites shard directory', (w) => w.jobs.backend_unit.steps[3].with['merge-multiple'] = true],
  ['checkout executes another revision', (w) => w.jobs.backend_unit_shards.steps[0].with.ref = 'main'],
  ['hidden Jest environment', (w) => w.jobs.backend_unit_shards.env = { JEST_JOBS: 'changed' }],
  ...['backend_unit_shards', 'backend_unit', 'backend_build_contracts'].flatMap((id) => [
    [`${id} continue-on-error`, (w) => w.jobs[id]['continue-on-error'] = true],
    [`${id} step skip`, (w) => w.jobs[id].steps[0].if = false],
  ]),
];
function lastRun(workflow, id) { return workflow.jobs[id].steps.filter((step) => typeof step.run === 'string').at(-1); }
function replaceRun(workflow, id, before, after) {
  const step = workflow.jobs[id].steps.find((step) => step.run?.includes(before));
  if (!step) throw new Error(`mutation target absent: ${before}`);
  step.run = step.run.replace(before, after);
}

export const coverageMutations = [
  ['sixth artifact omitted', (w) => w.jobs.backend_unit_coverage.strategy.matrix.shard.pop()],
  ['extra coverage shard', (w) => w.jobs.backend_unit_coverage.strategy.matrix.shard.push(7)],
  ['artifact completeness omitted', (w) => w.jobs.backend_unit_coverage.steps.splice(1, 1)],
  ['artifact completeness narrowed', (w) => w.jobs.backend_unit_coverage.steps[1].run = w.jobs.backend_unit_coverage.steps[1].run.replace('1 2 3 4 5 6', '1 2 3 4 5')],
  ['PR event gets OIDC writer', (w) => w.on = { pull_request: null }],
  ['global OIDC writer', (w) => w.permissions['id-token'] = 'write'],
  ['failed CI upload', (w) => delete w.jobs.backend_unit_coverage.if],
  ['untrusted checkout in privileged workflow', (w) => w.jobs.backend_unit_coverage.steps.unshift({ uses: 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10' })],
  ['untrusted code execution', (w) => w.jobs.backend_unit_coverage.steps.push({ run: 'npm ci && npm test' })],
  ['artifact JSON treated as shell code', (w) => w.jobs.backend_unit_coverage.steps.push({ run: 'eval "$(cat coverage-data/execution.json)"' })],
  ['wrong commit attribution', (w) => w.jobs.backend_unit_coverage.steps[2].with.override_commit = '${{ github.sha }}'],
  ['wrong artifact run', (w) => delete w.jobs.backend_unit_coverage.steps[0].with['run-id']],
  ['artifact name chosen by untrusted output', (w) => w.jobs.backend_unit_coverage.steps[0].with.pattern = '${{ github.event.workflow_run.name }}'],
  ['Codecov outage gates correctness', (w) => w.jobs.backend_unit_coverage.steps[2].with.fail_ci_if_error = true],
  ['Codecov scans artifact code', (w) => w.jobs.backend_unit_coverage.steps[2].with.disable_search = false],
  ['Codecov runs downloaded command', (w) => w.jobs.backend_unit_coverage.steps[2].with.run_command = 'coverage-data/run.sh'],
  ['unpinned uploader', (w) => w.jobs.backend_unit_coverage.steps[2].uses = 'codecov/codecov-action@main'],
  ['another privileged job', (w) => w.jobs.extra = { permissions: { 'id-token': 'write' } }],
];
