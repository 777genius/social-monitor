import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { backendUnitShardingViolations, coverageWorkflowViolations } from './backend-unit-contract.mjs';
import { unitMutations, coverageMutations } from './fixtures/workflow-mutations.mjs';

const unit = readFileSync('.github/workflows/pull-request.yml', 'utf8');
const coverage = readFileSync('.github/workflows/coverage.yml', 'utf8');
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
