import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { backendUnitShardingViolations, coverageWorkflowViolations } from './backend-unit-contract.mjs';
import { unitMutations, coverageMutations } from './fixtures/workflow-mutations.mjs';

const unit = readFileSync('.github/workflows/pull-request.yml', 'utf8');
const coverage = readFileSync('.github/workflows/coverage.yml', 'utf8');
// Heavy work needs a full VM; only the two reviewed aggregates may use slim.
const currentJobs = yaml.load(unit, { schema: yaml.JSON_SCHEMA }).jobs;
for (const id of Object.keys(currentJobs).filter((id) => !['backend_unit', 'production_runtime'].includes(id))) {
  test(`unit: rejects slim runner for ${id}`, () => {
    const workflow = yaml.load(unit, { schema: yaml.JSON_SCHEMA });
    workflow.jobs[id]['runs-on'] = 'ubuntu-slim';
    assert.ok(backendUnitShardingViolations(yaml.dump(workflow))
      .includes(`${id}: only the lightweight backend_unit and production_runtime aggregates may use ubuntu-slim`));
  });
}
for (const [label, source, check, mutations] of [
  ['unit', unit, backendUnitShardingViolations, unitMutations],
  ['coverage', coverage, coverageWorkflowViolations, coverageMutations],
]) {
  // Regression: textual equality would reject equivalent YAML formatting/key
  // ordering. The semantic contract must accept equivalent execution plans.
  test(`${label}: accepts current and equivalent YAML serialization`, () => {
    assert.deepEqual(check(source), []);
    const parsed = yaml.load(source, { schema: yaml.JSON_SCHEMA });
    const reordered = Object.fromEntries(Object.entries(parsed).reverse());
    assert.deepEqual(check(yaml.dump(reordered, { flowLevel: 5 })), []);
  });
  for (const [regression, mutate] of mutations) {
    // Regression is stated by the mutation label; accepting it would weaken a
    // specific observable completeness, failure propagation or authority gate.
    test(`${label}: rejects ${regression}`, () => {
      const value = yaml.load(source, { schema: yaml.JSON_SCHEMA });
      mutate(value);
      assert.notDeepEqual(check(yaml.dump(value)), []);
    });
  }
  // Regression: malformed YAML must never be reduced to matching source snippets.
  test(`${label}: rejects malformed and duplicate-key YAML`, () => {
    assert.match(check('jobs: [')[0], /invalid YAML/u);
    assert.match(check(`${source}\nname: duplicate\n`)[0], /invalid YAML/u);
  });
}

// These mutations exercise the execution plan: admission must fail before Jest,
// even when inventory reshuffling moves the genuine native cases to another shard.
const prerequisites = (w) => w.jobs.backend_unit_shards.steps.find((step) => step.run?.includes('firstpub-pgdg-'));
for (const [regression, mutate] of [
  ['missing native prerequisite', (w) => w.jobs.backend_unit_shards.steps.splice(w.jobs.backend_unit_shards.steps.indexOf(prerequisites(w)), 1)],
  ['native prerequisite after unit execution', (w) => {
    const steps = w.jobs.backend_unit_shards.steps;
    steps.push(steps.splice(steps.indexOf(prerequisites(w)), 1)[0]);
  }],
  ['assumed native shard number', (w) => prerequisites(w).if = 'matrix.shard == 4'],
  ['native installation failure masked', (w) => prerequisites(w)['continue-on-error'] = true],
  ['native shell failure masked', (w) => prerequisites(w).run += '\ntrue'],
  ...[
    ['shared-host installation', 'test "${RUNNER_ENVIRONMENT:-}" = github-hosted'],
    ['root native execution', 'test "$(id -u)" -ne 0'],
    ['unauthenticated package signing key', 'test "$pgdg_fingerprint" = B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8'],
    ['automatic package-managed cluster creation', "printf 'create_main_cluster = false\\n'"],
    ['missing genuine PG18 installation', 'postgresql-18 postgresql-client-18'],
    ['missing psql verification', 'initdb pg_ctl postgres psql'],
    ['missing PG18 major verification', '[[ "$pg18_version" =~'],
  ].map(([label, fragment]) => [label, (w) => {
    const step = prerequisites(w);
    assert.ok(step.run.includes(fragment), `missing mutation target: ${fragment}`);
    step.run = step.run.split('\n').filter((line) => !line.includes(fragment)).join('\n');
  }]),
  ['APT signature bypass', (w) => prerequisites(w).run = prerequisites(w).run.replace('[signed-by=', '[trusted=yes signed-by=')],
  ['unbounded package install', (w) => prerequisites(w).run = prerequisites(w).run.replaceAll('timeout 300 ', '')],
  ['native verification executed as root', (w) => prerequisites(w).run = prerequisites(w).run.replace('$("$pg18_executable" --version)', '$(sudo "$pg18_executable" --version)')],
]) {
  test(`unit: rejects ${regression}`, () => {
    const workflow = yaml.load(unit, { schema: yaml.JSON_SCHEMA });
    mutate(workflow);
    assert.notDeepEqual(backendUnitShardingViolations(yaml.dump(workflow)), []);
  });
}

// Execute the actual metadata and per-shard guards using credential-free fixtures.
// Explicit stripping keeps the npm gate compatible with the Node 22.6 floor;
// the CI TypeScript project independently typechecks this test's contracts.
test('coverage metadata and downloaded-file behavior', () => {
  execFileSync(process.execPath, ['--experimental-strip-types', '--test',
    'scripts/ci/review-ci/coverage-data.test.mts'], {
    timeout: 15000, env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
});

// Execute the actual inventory and runtime shell with synthetic node argv capture.
// This proves Bash array expansion and one execution per shard without running Jest.
test('unit worker argv is bounded to shard2 and inventory is always serial', () => {
  const steps = currentJobs.backend_unit_shards.steps;
  const inventory = steps.find((step) => step.name === 'List the complete unit inventory before sharding').run;
  const runtime = steps.find((step) => step.name === 'Run backend unit tests once with coverage').run;
  const capture = `node() {
    if [ "$1" = scripts/ci/verify-jest-shard-completeness.mjs ]; then
      printf '%s' '/synthetic-excluded/'
    else
      printf '%s\\0' "$@" >> "$ARGV_FILE"
    fi
  }\n`;
  const directory = mkdtempSync(join(tmpdir(), 'unit-workers-'));
  try {
    for (let shard = 1; shard <= 6; shard += 1) {
      for (const [kind, shell] of [['inventory', inventory], ['runtime', runtime]]) {
        const argvFile = join(directory, `${kind}-${shard}`);
        execFileSync('bash', ['-c', capture + shell.replaceAll('${{ matrix.shard }}', String(shard))], {
          cwd: directory, timeout: 5000, env: { ...process.env, ARGV_FILE: argvFile },
        });
        const args = readFileSync(argvFile, 'utf8').split('\0').slice(0, -1);
        assert.deepEqual(args, [
          'scripts/run-with-timeout.mjs', '--timeout-ms', kind === 'inventory' ? '120000' : '2700000',
          '--node-options', kind === 'inventory' ? '--max-old-space-size=2048' : '--max-old-space-size=4096',
          '--', './node_modules/.bin/jest', '--config', 'jest.config.ts',
          kind === 'runtime' && shard === 2 ? '--maxWorkers=2' : '--runInBand',
          ...(kind === 'runtime' ? [`--shard=${shard}/6`] : []),
          '--testPathIgnorePatterns=/synthetic-excluded/',
          ...(kind === 'inventory' ? ['--listTests', '--json'] : [
            '--coverage', '--coverageDirectory=coverage', '--coverageReporters=lcovonly',
            '--json', '--outputFile=reports/execution.json',
          ]),
        ]);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
