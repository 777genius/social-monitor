import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import '../lib/external-beta-runtime-negative-smoke-scenarios.test.mjs';

const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const cases = [
  ['validateRunnerNegativeDurableRuntimeArtifactSmokes', 'durableRuntimeNegativeSmokeScenarios'],
  ['validateRunnerNegativeStagingReliabilityArtifactSmokes', 'stagingReliabilityNegativeSmokeScenarios'],
];
function assertDelegated(candidate) {
  const active = candidate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(active, /from '\.\/lib\/external-beta-runtime-negative-smoke-scenarios\.mjs'/);
  for (const [caller, factory] of cases) {
    const marker = `function ${caller}() {\n`;
    const start = active.indexOf(marker);
    const end = active.indexOf('\n\n  for (const scenario of scenarios) {', start);
    assert.ok(start >= 0 && end > start, caller);
    const setup = active.slice(start + marker.length, end);
    const statement = `const scenarios = ${factory}();`;
    assert.ok(setup.includes(statement), caller);
    const calls = [];
    runInNewContext(setup, { [factory]: () => { calls.push(factory); return []; } }, { timeout: 1000 });
    assert.deepEqual(calls, [factory], caller);
  }
}
test('both original runtime negative smoke validators delegate to pure scenario factories', () => {
  assertDelegated(source);
  assert.doesNotMatch(source, /const scenarios = \[\n {4}\{\n {6}label: 'durable runtime fixture provenance'/);
  assert.doesNotMatch(source, /const scenarios = \[\n {4}\{\n {6}label: 'staging reliability fixture provenance'/);
});
test('deleted or commented runtime scenario call fails closed', () => {
  for (const [, factory] of cases) {
    const statement = `const scenarios = ${factory}();`;
    assert.ok(source.includes(statement));
    assert.throws(() => assertDelegated(source.replace(statement, '')), { code: 'ERR_ASSERTION' });
    assert.throws(() => assertDelegated(source.replace(statement, '// ' + statement)), { code: 'ERR_ASSERTION' });
  }
});
test('unreachable runtime scenario call cannot satisfy behavioral delegation', () => {
  for (const [, factory] of cases) {
    const statement = `const scenarios = ${factory}();`;
    assert.throws(() => assertDelegated(source.replace(statement, `if (false) { ${statement} }`)), { code: 'ERR_ASSERTION' });
  }
});
