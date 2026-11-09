import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

import '../lib/external-beta-source-live-negative-smoke-scenarios.test.mjs';

const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');

function assertScenariosDelegated(candidate) {
  const active = candidate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(active, /from '\.\/lib\/external-beta-source-live-negative-smoke-scenarios\.mjs'/);
  const startMarker = 'function validateRunnerNegativeSmokes() {\n';
  const start = active.indexOf(startMarker);
  const end = active.indexOf('\n\n  for (const scenario of scenarios) {', start);
  assert.ok(start >= 0 && end > start);
  const setup = active.slice(start + startMarker.length, end);
  assert.match(setup, /const scenarios = sourceLiveNegativeSmokeScenarios\(\);/);
  const calls = [];
  runInNewContext(setup, {
    sourceLiveNegativeSmokeScenarios: () => {
      calls.push('scenarios');
      return [];
    },
  }, { timeout: 1000 });
  assert.deepEqual(calls, ['scenarios']);
}

test('original negative smoke runner delegates scenarios before I/O and execution', () => {
  assertScenariosDelegated(source);
  assert.doesNotMatch(source, /const wrongImageDigest =/);
});

test('removed or commented negative scenario delegation fails the gate', () => {
  const statement = 'const scenarios = sourceLiveNegativeSmokeScenarios();';
  assert.ok(source.includes(statement));
  assert.throws(() => assertScenariosDelegated(source.replace(statement, '')), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertScenariosDelegated(source.replace(statement, '// ' + statement)),
    { code: 'ERR_ASSERTION' });
});

test('unreachable negative scenario delegation fails the behavioral gate', () => {
  const statement = 'const scenarios = sourceLiveNegativeSmokeScenarios();';
  assert.throws(() => assertScenariosDelegated(source.replace(statement, 'if (false) { ' + statement + ' }')),
    { code: 'ERR_ASSERTION' });
});
