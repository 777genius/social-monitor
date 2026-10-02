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
