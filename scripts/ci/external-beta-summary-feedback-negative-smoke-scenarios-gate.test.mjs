import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import '../lib/external-beta-summary-feedback-negative-smoke-scenarios.test.mjs';

const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const statement = 'const scenarios = summaryFeedbackNegativeSmokeScenarios();';
function assertDelegated(candidate) {
  const active = candidate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(active, /from '\.\/lib\/external-beta-summary-feedback-negative-smoke-scenarios\.mjs'/);
  const marker = 'function validateRunnerNegativeSummaryFeedbackArtifactSmokes() {\n';
  const start = active.indexOf(marker);
  const end = active.indexOf('\n\n  for (const scenario of scenarios) {', start);
  assert.ok(start >= 0 && end > start, 'negative summary-feedback runner must remain present');
  const setup = active.slice(start + marker.length, end);
  assert.ok(setup.includes(statement), 'scenario factory must be assigned to the original loop');
  const sentinel = [];
  let calls = 0;
  const bound = runInNewContext(setup + '\nscenarios', {
    summaryFeedbackNegativeSmokeScenarios: () => { calls++; return sentinel; },
  }, { timeout: 1000 });
  assert.equal(calls, 1);
  assert.strictEqual(bound, sentinel);
}
test('original summary-feedback negative smoke validator actively delegates to pure scenario factory', () => {
  assertDelegated(source);
  assert.doesNotMatch(source, /const scenarios = \[\n {4}\{\n {6}label: 'summary feedback fixture sample id'/);
});
test('deleted or commented summary-feedback factory invocation fails closed', () => {
  assert.throws(() => assertDelegated(source.replace(statement, '')), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertDelegated(source.replace(statement, '// ' + statement)), { code: 'ERR_ASSERTION' });
});
test('unreachable summary-feedback factory invocation cannot satisfy original runner', () => {
  assert.throws(() => assertDelegated(source.replace(statement, 'if (false) { ' + statement + ' }')), {
    name: 'ReferenceError', message: 'scenarios is not defined',
  });
});
test('nested summary-feedback factory result cannot be replaced by an empty loop array', () => {
  assert.throws(() => assertDelegated(source.replace(statement, '{ ' + statement + ' }\n  const scenarios = [];')), {
    code: 'ERR_ASSERTION',
  });
});
