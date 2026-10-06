// Each label states the CI regression the mutated workflow must reject.
export const unitMutations = [
  // Regression: optimization flags must not suppress lifecycle scripts or
  // weaken the standalone audit; concurrency stays a shard2-only experiment.
  ['unit install drops offline preference', (w) => replaceRun(w, 'backend_unit_shards', ' --prefer-offline', '')],
  ['unit install drops no-audit scope', (w) => replaceRun(w, 'backend_unit_shards', ' --no-audit', '')],
  ['unit lifecycle scripts disabled', (w) => replaceRun(w, 'backend_unit_shards', 'npm ci --prefer-offline --no-audit', 'npm ci --prefer-offline --no-audit --ignore-scripts')],
  ['unit dev dependencies omitted', (w) => replaceRun(w, 'backend_unit_shards', 'npm ci --prefer-offline --no-audit', 'npm ci --prefer-offline --no-audit --omit=dev')],
  ['Prisma generation omitted', (w) => replaceRun(w, 'backend_unit_shards', 'npm run prisma:generate', 'true')],
  ['no-audit copied into security install', (w) => replaceRun(w, 'security_contracts', 'npm ci', 'npm ci --no-audit')],
  ['standalone dependency audit omitted', (w) => replaceRun(w, 'security_contracts', 'npm run check:dependencies', 'true')],
  ['standalone dependency audit masked', (w) => replaceRun(w, 'security_contracts', 'npm run check:dependencies', 'npm run check:dependencies || true')],
  ['global advisory suppression', (w) => w.env.NPM_CONFIG_AUDIT = 'false'],
  ['all shards use two workers', (w) => replaceRun(w, 'backend_unit_shards', 'unit_workers=(--runInBand)', 'unit_workers=(--maxWorkers=2)')],
  ['pilot expanded beyond shard2', (w) => replaceRun(w, 'backend_unit_shards', '"${{ matrix.shard }}" = 2', '"${{ matrix.shard }}" != 6')],
  ['pilot moved to shard3', (w) => replaceRun(w, 'backend_unit_shards', '"${{ matrix.shard }}" = 2', '"${{ matrix.shard }}" = 3')],
  ['four-worker pilot', (w) => replaceRun(w, 'backend_unit_shards', '--maxWorkers=2', '--maxWorkers=4')],
  ['percentage-worker pilot', (w) => replaceRun(w, 'backend_unit_shards', '--maxWorkers=2', '--maxWorkers=50%')],
  ['unbounded Jest defaults', (w) => replaceRun(w, 'backend_unit_shards', '"${unit_workers[@]}" ', '')],
  ['discovery denominator drift', (w) => discovery(w).run = discovery(w).run.replaceAll('/6', '/7')],
  ['decision denominator drift', (w) => discovery(w).run = discovery(w).run.replace('--shard ${{ matrix.shard }}/6', '--shard ${{ matrix.shard }}/4')],
  ['selection leaks into report artifact', (w) => discovery(w).run = discovery(w).run.replaceAll('$RUNNER_TEMP/backend-unit-selection.json', 'reports/selection.json')],
  ['discovery uses different exclusions', (w) => discovery(w).run = discovery(w).run.replace('--testPathIgnorePatterns="$unit_ignore"', '--testPathIgnorePatterns=hidden')],
  ['discovery uses different config', (w) => discovery(w).run = discovery(w).run.replace('jest.config.ts', 'test/jest-e2e.json')],
  ['selection validation omitted', (w) => discovery(w).run = discovery(w).run.trimEnd().split('\n').slice(0, -1).join('\n')],
  ['selection validation failure masked', (w) => discovery(w).run += ' || true'],
  ['discovery failure masked', (w) => discovery(w).run = discovery(w).run.replace('set -euo pipefail', 'set -uo pipefail')],
  ['discovery conditional shard assumption', (w) => discovery(w).if = 'matrix.shard == 6'],
  ['discovery continue-on-error', (w) => discovery(w)['continue-on-error'] = true],
  ['native bootstrap always bypassed', (w) => replaceRun(w, 'backend_unit_shards', 'case "${{ steps.native_pg18.outputs.need_pg18 }}" in', 'case false in')],
  ['missing decision bypasses installation', (w) => replaceRun(w, 'backend_unit_shards', "*) echo 'Invalid native prerequisite decision' >&2; exit 1 ;;", '*) exit 0 ;;')],
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
function discovery(workflow) { return workflow.jobs.backend_unit_shards.steps.find((step) => step.id === 'native_pg18'); }
function lastRun(workflow, id) { return workflow.jobs[id].steps.filter((step) => typeof step.run === 'string').at(-1); }
function replaceRun(workflow, id, before, after) {
  const step = workflow.jobs[id].steps.find((step) => step.run?.includes(before));
  if (!step) throw new Error(`mutation target absent: ${before}`);
  step.run = step.run.replace(before, after);
}

export const coverageMutations = [
  ['metadata preflight omitted', (w) => delete w.jobs.coverage_artifacts],
  ['metadata preflight bypassed', (w) => delete w.jobs.backend_unit_coverage.needs],
  ['failed-run metadata accepted', (w) => delete w.jobs.coverage_artifacts.if],
  ['preflight gets OIDC writer', (w) => w.jobs.coverage_artifacts.permissions['id-token'] = 'write'],
  ['metadata sourced from another run', (w) => w.jobs.coverage_artifacts.steps[0].env.RUN_ID = '${{ github.run_id }}'],
  ['expired metadata accepted', (w) => replaceRun(w, 'coverage_artifacts', '.expired == false', 'true')],
  ['wrong-run metadata accepted', (w) => replaceRun(w, 'coverage_artifacts', '.workflow_run.id == $run_id', 'true')],
  ['all six artifacts downloaded by each shard', (w) => {
    const parameters = w.jobs.backend_unit_coverage.steps[0].with;
    delete parameters.name;
    parameters.pattern = 'backend-unit-coverage-*';
  }],
  ['own-shard validation mismatched', (w) => w.jobs.backend_unit_coverage.steps[1].env.SHARD = 1],
  ['symlink guard removed', (w) => replaceRun(w, 'backend_unit_coverage', 'test ! -L "$directory/lcov.info"', 'true')],
  ['wrong PR attribution', (w) => w.jobs.backend_unit_coverage.steps[2].with.override_pr = '${{ github.event.number }}'],
  ['sixth artifact omitted', (w) => w.jobs.backend_unit_coverage.strategy.matrix.shard.pop()],
  ['extra coverage shard', (w) => w.jobs.backend_unit_coverage.strategy.matrix.shard.push(7)],
  ['artifact completeness omitted', (w) => w.jobs.backend_unit_coverage.steps.splice(1, 1)],
  ['artifact completeness narrowed', (w) => w.jobs.coverage_artifacts.steps[0].run = w.jobs.coverage_artifacts.steps[0].run.replace('backend-unit-coverage-6', 'backend-unit-coverage-5')],
  ['PR event gets OIDC writer', (w) => w.on = { pull_request: null }],
  ['global OIDC writer', (w) => w.permissions['id-token'] = 'write'],
  ['failed CI upload', (w) => delete w.jobs.backend_unit_coverage.if],
  ['untrusted checkout in privileged workflow', (w) => w.jobs.backend_unit_coverage.steps.unshift({ uses: 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10' })],
  ['untrusted code execution', (w) => w.jobs.backend_unit_coverage.steps.push({ run: 'npm ci && npm test' })],
  ['artifact JSON treated as shell code', (w) => w.jobs.backend_unit_coverage.steps.push({ run: 'eval "$(cat coverage-data/execution.json)"' })],
  ['wrong commit attribution', (w) => w.jobs.backend_unit_coverage.steps[2].with.override_commit = '${{ github.sha }}'],
  ['wrong artifact run', (w) => delete w.jobs.backend_unit_coverage.steps[0].with['run-id']],
  ['artifact name chosen by untrusted output', (w) => w.jobs.backend_unit_coverage.steps[0].with.name = '${{ github.event.workflow_run.name }}'],
  ['Codecov outage gates correctness', (w) => w.jobs.backend_unit_coverage.steps[2].with.fail_ci_if_error = true],
  ['Codecov scans artifact code', (w) => w.jobs.backend_unit_coverage.steps[2].with.disable_search = false],
  ['Codecov runs downloaded command', (w) => w.jobs.backend_unit_coverage.steps[2].with.run_command = 'coverage-data/run.sh'],
  ['unpinned uploader', (w) => w.jobs.backend_unit_coverage.steps[2].uses = 'codecov/codecov-action@main'],
  ['another privileged job', (w) => w.jobs.extra = { permissions: { 'id-token': 'write' } }],
];
