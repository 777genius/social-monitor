import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import '../lib/external-beta-preflight-negative-smoke-scenarios.test.mjs';

const original = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const statement = 'const scenarios = preflightNegativeSmokeScenarios();';

function assertActiveDelegation(source) {
  const active = source.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(active, /from '\.\/lib\/external-beta-preflight-negative-smoke-scenarios\.mjs'/);
  const marker = 'function validateRunnerPreflightNegativeSmokes() {\n';
  const start = active.indexOf(marker);
  const end = active.indexOf('\n\n  for (const scenario of scenarios) {', start);
  assert.ok(start >= 0 && end > start, 'original negative preflight executor and loop must remain');
  const setup = active.slice(start + marker.length, end);
  assert.ok(setup.includes(statement), 'original loop must bind factory-produced scenarios');
  let calls = 0;
  const sentinel = [];
  const value = runInNewContext(setup + '\nscenarios', {
    preflightNegativeSmokeScenarios: () => { calls++; return sentinel; },
  }, { timeout: 1000 });
  assert.strictEqual(value, sentinel);
  assert.equal(calls, 1);
}

test('the original 300s checker actively delegates its preflight scenario list', () => {
  assertActiveDelegation(original);
  assert.doesNotMatch(original, /const scenarios = \[\n {4}\{\n {6}label: 'raw OIDC_TEST_TOKEN_REF/);
});

test('missing and commented-out preflight delegation both fail closed', () => {
  assert.throws(() => assertActiveDelegation(original.replace(statement, '')), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertActiveDelegation(original.replace(statement, '// ' + statement)), { code: 'ERR_ASSERTION' });
});

test('unreachable, nested or replaced preflight declarations cannot satisfy the real loop', () => {
  assert.throws(() => assertActiveDelegation(original.replace(statement, 'if (false) { ' + statement + ' }')));
  assert.throws(() => assertActiveDelegation(original.replace(statement, '{ ' + statement + ' }\n  const scenarios = [];')), { code: 'ERR_ASSERTION' });
});

test('CRLF checkouts preserve active delegation and still reject disabled invocations', () => {
  const crlf = original.replace(/\r?\n/g, '\r\n');
  assertActiveDelegation(crlf);
  assert.throws(() => assertActiveDelegation(crlf.replace(statement, '// ' + statement)));
});
