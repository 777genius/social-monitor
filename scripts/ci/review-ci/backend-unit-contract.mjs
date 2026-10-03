import yaml from 'js-yaml';

// js-yaml is already reproducibly locked at the root by ESLint's dependency graph.
// Parse the full document with duplicate-key rejection. Commands below use a
// deliberately small shell language: fixed argv, or fail-fast sequential lines.
const checkout = 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10';
const node = 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e';
const upload = 'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f';
const download = 'actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131';
const codecov = 'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f';
const shard = '${{ matrix.shard }}';
const jest = 'node scripts/run-with-timeout.mjs --timeout-ms 2700000 --node-options --max-old-space-size=4096 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand';
const ignore = 'unit_ignore="$(node scripts/ci/verify-jest-shard-completeness.mjs --ignore-pattern ops/ci/jest-inventory-exclusions.txt)"';
const selector = '--testPathIgnorePatterns="$unit_ignore"';
const inventory = 'node scripts/run-with-timeout.mjs --timeout-ms 120000 --node-options --max-old-space-size=2048 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --testPathIgnorePatterns="$unit_ignore" --listTests --json > reports/inventory.json';
const proof = 'node scripts/ci/verify-jest-shard-completeness.mjs --reports unit-reports --root . --exclusions ops/ci/jest-inventory-exclusions.txt';
const canary = 'set -euo pipefail\nnode --test scripts/lib/reader-promotion-v2-production-canary-control.test.mjs\nnode scripts/run-with-timeout.mjs --timeout-ms 120000 --node-options --max-old-space-size=1024 -- ./node_modules/.bin/jest --config jest.config.ts --runInBand --runTestsByPath scripts/lib/reader-promotion-v2-production-canary-runner.spec.ts\nbash ops/deploy/production-runtime/reader-promotion-v2-production-canary.test.sh';
const normalize = (value) => typeof value === 'string' ? value.trim().split(/\r?\n/u)
  .map((line) => line.trim().replace(/[ \t]+/gu, ' ')).filter(Boolean).join('\n') : value;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => record(value) && Object.keys(value).every((key) => allowed.includes(key));
const equal = (left, right) => {
  if (record(right)) return record(left) && Object.keys(left).length === Object.keys(right).length &&
    Object.entries(right).every(([key, value]) => equal(left[key], value));
  if (Array.isArray(right)) return Array.isArray(left) && left.length === right.length && left.every((value, i) => equal(value, right[i]));
  return left === right;
};

function parse(source) {
  return yaml.load(source, { schema: yaml.JSON_SCHEMA, json: false });
}

function jobChecks(job, id, expectedName, expectedSteps, errors, extra = [], requiredTimeout = null) {
  const reject = (message) => errors.push(`${id}: ${message}`);
  if (!keys(job, ['name', 'runs-on', 'timeout-minutes', 'steps', ...extra])) {
    reject('unknown execution keys, masking or skip policy');
    return;
  }
  if (job.name !== expectedName || job['runs-on'] !== 'ubuntu-latest' ||
      !Number.isInteger(job['timeout-minutes']) || job['timeout-minutes'] < 1 ||
      (requiredTimeout === null ? job['timeout-minutes'] > 45 : job['timeout-minutes'] !== requiredTimeout)) {
    reject('stable name, runner and bounded timeout required');
  }
  if (!Array.isArray(job.steps) || job.steps.length !== expectedSteps.length) {
    reject('complete execution steps required exactly once');
    return;
  }
  job.steps.forEach((step, index) => {
    const expected = expectedSteps[index];
    if (!keys(step, ['name', ...(expected.run ? ['run'] : ['uses', 'with'])])) {
      reject(`step ${index + 1}: conditional, masking or unknown step key`);
    } else if (expected.run) {
      if (normalize(step.run) !== normalize(expected.run)) reject(`step ${index + 1}: unfiltered, bounded fail-fast command required`);
    } else if (step.uses !== expected.uses || !equal(step.with, expected.with)) {
      reject(`step ${index + 1}: pinned action and safe data parameters required`);
    }
  });
}
const checkoutStep = (full = false) => ({ uses: checkout, with: {
  ref: '${{ github.sha }}', 'persist-credentials': false, ...(full ? { 'fetch-depth': 0 } : {}),
} });
const nodeStep = (cache = true) => ({ uses: node, with: { 'node-version': 22, ...(cache ? { cache: 'npm' } : {}) } });
const setup = (full = false) => [checkoutStep(full), nodeStep(), { run: 'npm ci' }, { run: 'npm run prisma:generate' }];
// Exact authenticated, nonroot, runner-only prerequisite; no shard-specific admission.
const nativePg18 = [
  "set -euo pipefail",
  "# Package installation is authorized only on a disposable GitHub-hosted Ubuntu runner.",
  "test \"${GITHUB_ACTIONS:-}\" = true",
  "test \"${RUNNER_ENVIRONMENT:-}\" = github-hosted",
  "test \"${RUNNER_OS:-}\" = Linux",
  "test \"$(id -u)\" -ne 0",
  ". /etc/os-release",
  "test \"$ID\" = ubuntu",
  "[[ \"$VERSION_CODENAME\" =~ ^[a-z]+$ ]]",
  "pgdg_scratch=\"$(mktemp -d \"$RUNNER_TEMP/firstpub-pgdg-XXXXXXXX\")\"",
  "trap 'rm -rf -- \"$pgdg_scratch\"' EXIT",
  "mkdir -m 700 \"$pgdg_scratch/gnupg\"",
  "curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 60 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o \"$pgdg_scratch/pgdg.asc\"",
  "pgdg_fingerprint=\"$(gpg --batch --homedir \"$pgdg_scratch/gnupg\" --show-keys --with-colons \"$pgdg_scratch/pgdg.asc\" | awk -F: '$1 == \"fpr\" { print $10; exit }')\"",
  "test \"$pgdg_fingerprint\" = B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8",
  "sudo install -m 644 \"$pgdg_scratch/pgdg.asc\" /usr/share/keyrings/firstpub-pgdg.asc",
  "printf 'deb [signed-by=/usr/share/keyrings/firstpub-pgdg.asc] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\\n' \"$VERSION_CODENAME\" | sudo tee /etc/apt/sources.list.d/firstpub-pgdg.list > /dev/null",
  "sudo timeout 180 apt-get update",
  "sudo env DEBIAN_FRONTEND=noninteractive timeout 300 apt-get install --yes --no-install-recommends postgresql-common",
  "# Install executables only: do not create or start a package-managed cluster.",
  "printf 'create_main_cluster = false\\n' | sudo tee /etc/postgresql-common/createcluster.conf > /dev/null",
  "sudo env DEBIAN_FRONTEND=noninteractive timeout 300 apt-get install --yes --no-install-recommends postgresql-18 postgresql-client-18",
  "for pg18_tool in initdb pg_ctl postgres psql; do",
  "  pg18_executable=\"/usr/lib/postgresql/18/bin/$pg18_tool\"",
  "  test -x \"$pg18_executable\"",
  "  pg18_version=\"$(\"$pg18_executable\" --version)\"",
  "  [[ \"$pg18_version\" =~ ^$pg18_tool\\ \\(PostgreSQL\\)\\ 18\\. ]]",
  "  printf '%s\\n' \"$pg18_version\"",
  "done",
].join('\n');
const matrix = { 'fail-fast': false, matrix: { shard: [1, 2, 3, 4] } };

export function backendUnitShardingViolations(source) {
  let workflow;
  try { workflow = parse(source); } catch (error) { return [`pull-request.yml: invalid YAML: ${error.message}`]; }
  const errors = [];
  if (!record(workflow)) return ['pull-request.yml: workflow must be a mapping'];
  if (workflow.name !== 'Pull request checks' || !equal(workflow.on, {
    push: { branches: ['main'] }, pull_request: null, merge_group: null, workflow_dispatch: null,
  })) errors.push('pull-request.yml: full push-main, PR, merge-group and dispatch triggers required');
  if (!equal(workflow.concurrency, {
    group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}', 'cancel-in-progress': true,
  })) errors.push('pull-request.yml: PR cancellation must be isolated from other main SHAs');
  if (!equal(workflow.permissions, { contents: 'read' }) || workflow.defaults !== undefined ||
      !equal(Object.keys(workflow.env ?? {}), ['DATABASE_URL'])) errors.push('pull-request.yml: read-only authority and no hidden execution defaults');
  for (const job of Object.values(workflow.jobs ?? {})) {
    if (job?.permissions !== undefined && (!record(job.permissions) || Object.values(job.permissions).some((value) => !['read', 'none'].includes(value)))) {
      errors.push('pull-request.yml: jobs must not grant write authority');
    }
  }
  const jobs = workflow.jobs ?? {};
  jobChecks(jobs.backend_unit_shards, 'backend_unit_shards', `Backend unit shard ${shard}/4`, [
    ...setup(),
    { run: nativePg18 },
    { run: `set -euo pipefail\nmkdir -p reports\n${ignore}\n${inventory}` },
    { run: `set -euo pipefail\n${ignore}\n${jest} --shard=${shard}/4 ${selector} --coverage --coverageDirectory=coverage --coverageReporters=lcovonly --json --outputFile=reports/execution.json` },
    { uses: upload, with: { name: `backend-unit-report-${shard}`, path: 'reports/*.json', 'if-no-files-found': 'error', 'retention-days': 1 } },
    { uses: upload, with: { name: `backend-unit-coverage-${shard}`, path: 'coverage/lcov.info', 'if-no-files-found': 'error', 'retention-days': 1 } },
  ], errors, ['strategy'], 60);
  if (!equal(jobs.backend_unit_shards?.strategy, matrix)) errors.push('backend_unit_shards: all four shards with one consistent denominator required');
  jobChecks(jobs.backend_build_contracts, 'backend_build_contracts', 'Backend build and sandbox contracts', [
    ...setup(true),
    { run: 'npm run check:reader-paired-experiment' }, { run: 'npm run build' },
    { run: 'npm run check:subscription-runtime-auth-pool-e2e' },
    { run: 'npm run check:subscription-runtime-usage-contract' }, { run: canary },
  ], errors);
  // The manifest assigns the selected canary Jest contract to this build job;
  // it is excluded from both unit discovery and execution, and runs once.
  const needs = ['backend_unit_shards', 'backend_build_contracts'];
  const aggregate = jobs.backend_unit;
  if (!equal(aggregate?.needs, needs) || !['always()', '${{ always() }}'].includes(aggregate?.if)) {
    errors.push('backend_unit: always aggregate must depend on every backend command');
  }
  jobChecks(aggregate, 'backend_unit', 'Backend build and unit tests', [
    { run: `set -euo pipefail\n${needs.map((id) => `test "\${{ needs.${id}.result }}" = "success"`).join('\n')}` },
    checkoutStep(), nodeStep(false),
    { uses: download, with: { pattern: 'backend-unit-report-*', path: 'unit-reports', 'merge-multiple': false } },
    { run: proof },
  ], errors, ['needs', 'if']);
  for (const [id, job] of Object.entries(jobs)) {
    if (id === 'backend_unit_shards') continue;
    for (const step of job?.steps ?? []) {
      if (typeof step.run === 'string' && (/(?:^|\s)npm\s+(?:run\s+)?test(?:\s|$)/u.test(step.run) ||
          (/jest\b/u.test(step.run) && /--config[= ]jest.config.ts/u.test(step.run) && !/--runTestsByPath\b/u.test(step.run)))) {
        errors.push(`${id}: full unit execution must occur only in required shards`);
      }
    }
  }
  return errors;
}

export function coverageWorkflowViolations(source) {
  let workflow;
  try { workflow = parse(source); } catch (error) { return [`coverage.yml: invalid YAML: ${error.message}`]; }
  const errors = [];
  if (!keys(workflow, ['name', 'on', 'permissions', 'concurrency', 'jobs']) ||
      workflow.name !== 'Code coverage' || !equal(workflow.on, {
        workflow_run: { workflows: ['Pull request checks'], types: ['completed'] },
      }) || !equal(workflow.permissions, {}) || !equal(workflow.concurrency, {
        group: '${{ github.workflow }}-${{ github.event.workflow_run.id }}', 'cancel-in-progress': false,
      }) || !equal(Object.keys(workflow.jobs ?? {}), ['backend_unit_coverage'])) {
    errors.push('coverage.yml: workflow_run data-only uploader with no global write authority required');
  }
  const job = workflow?.jobs?.backend_unit_coverage;
  if (job?.if !== "github.event.workflow_run.conclusion == 'success'" ||
      !equal(job?.permissions, { actions: 'read', contents: 'read', 'id-token': 'write' }) ||
      !equal(job?.strategy, matrix)) errors.push('coverage.yml: success-only OIDC upload scoped to one job required');
  jobChecks(job, 'backend_unit_coverage', `Backend coverage shard ${shard}/4`, [
    { uses: download, with: { name: `backend-unit-coverage-${shard}`, path: 'coverage-data',
      'github-token': '${{ github.token }}', 'run-id': '${{ github.event.workflow_run.id }}' } },
    { uses: codecov, with: { use_oidc: true, fail_ci_if_error: false, disable_search: true,
      files: 'coverage-data/lcov.info', override_commit: '${{ github.event.workflow_run.head_sha }}',
      override_pr: '${{ github.event.workflow_run.pull_requests[0].number }}',
      flags: 'backend-unit', name: `backend-unit-shard-${shard}` } },
  ], errors, ['if', 'permissions', 'strategy']);
  return errors;
}
