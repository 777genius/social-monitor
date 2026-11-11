import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import '../lib/external-beta-preflight-negative-smoke-scenarios.test.mjs';

const original = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const extracted = readFileSync(new URL('../lib/external-beta-preflight-command-smokes.mjs', import.meta.url), 'utf8');
const statement = 'const scenarios = preflightNegativeSmokeScenarios();';
const invocation = 'validateRunnerPreflightNegativeSmokes();';

function withoutComments(source) {
  return source.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function assertShorthandProperties(block, expected) {
  const names = block.split(',').map((name) => name.trim()).filter(Boolean);
  assert.equal(names.length, expected.length, 'initializer must provide exactly the expected shorthand properties');
  assert.deepEqual(new Set(names), new Set(expected));
}

function assertActiveDelegation(checkerSource, helperSource = extracted) {
  const checker = withoutComments(checkerSource);
  const helper = withoutComments(helperSource);
  assert.match(checker, /^import \{ preflightNegativeSmokeScenarios \} from '\.\/lib\/external-beta-preflight-negative-smoke-scenarios\.mjs';$/m);
  assert.match(checker, /^import \{ createExternalBetaPreflightCommandSmokes \} from '\.\/lib\/external-beta-preflight-command-smokes\.mjs';$/m);
  const wiring = checker.match(/const\s*\{([^{}]+)\}\s*=\s*createExternalBetaPreflightCommandSmokes\(\s*\{([^{}]+)\}\s*\);/);
  assert.ok(wiring, 'checker must initialize the extracted preflight validator');
  assertShorthandProperties(wiring[1], [
    'validateRunnerPreflightNegativeSmokes', 'validateRunnerPreflightPositiveSmoke',
  ]);
  assertShorthandProperties(wiring[2], [
    'contract', 'violations', 'execFileSync', 'runnerSmokeTimeoutMs',
    'preflightNegativeSmokeScenarios', 'mkdtempSync', 'tmpdir', 'join', 'rmSync',
    'completeExternalEvidencePreflightEnv', 'redditOAuthPreflightEnv',
    'childProcessErrorOutput', 'smokeOutputSnippet',
  ]);
  assert.match(checker, /^validateRunnerPreflightNegativeSmokes\(\);$/m);
  assert.match(checker, /^validateRunnerPreflightPositiveSmoke\(\);$/m);
  assert.match(helper, /return \{\s*validateRunnerPreflightNegativeSmokes,\s*validateRunnerPreflightPositiveSmoke,\s*\};/);

  const marker = '  function validateRunnerPreflightNegativeSmokes() {\n';
  const start = helper.indexOf(marker);
  const end = helper.indexOf('\n\n    for (const scenario of scenarios) {', start);
  assert.ok(start >= 0 && end > start, 'extracted negative preflight executor and loop must remain');
  const setup = helper.slice(start + marker.length, end);
  assert.ok(setup.includes(statement), 'extracted loop must bind factory-produced scenarios');
  let calls = 0;
  const sentinel = [];
  const value = runInNewContext(setup + '\nscenarios', {
    preflightNegativeSmokeScenarios: () => { calls++; return sentinel; },
  }, { timeout: 1000 });
  assert.strictEqual(value, sentinel);
  assert.equal(calls, 1);
}

test('the original 300s checker actively delegates the extracted preflight scenario list', () => {
  assertActiveDelegation(original);
  assert.doesNotMatch(original, /const scenarios = \[\n {4}\{\n {6}label: 'raw OIDC_TEST_TOKEN_REF/);
});

test('missing and commented-out preflight delegation both fail closed', () => {
  assert.throws(() => assertActiveDelegation(original, extracted.replace(statement, '')), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertActiveDelegation(original, extracted.replace(statement, '// ' + statement)), { code: 'ERR_ASSERTION' });
});

test('unreachable, nested or replaced preflight declarations cannot satisfy the real loop', () => {
  assert.throws(() => assertActiveDelegation(original, extracted.replace(statement, 'if (false) { ' + statement + ' }')));
  assert.throws(() => assertActiveDelegation(original, extracted.replace(statement, '{ ' + statement + ' }\n    const scenarios = [];')), { code: 'ERR_ASSERTION' });
});

test('missing or commented-out checker wiring cannot bypass the extracted preflight loop', () => {
  assert.throws(() => assertActiveDelegation(original.replace(invocation, '')), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertActiveDelegation(original.replace(invocation, '// ' + invocation)), { code: 'ERR_ASSERTION' });
  const positiveInvocation = 'validateRunnerPreflightPositiveSmoke();';
  assert.ok(original.includes(positiveInvocation), 'positive invocation must exist for mutation checks');
  assert.throws(() => assertActiveDelegation(original.replace(positiveInvocation, '')), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertActiveDelegation(original.replace(positiveInvocation, '// ' + positiveInvocation)), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertActiveDelegation(original.replace('preflightNegativeSmokeScenarios, mkdtempSync', 'mkdtempSync')), { code: 'ERR_ASSERTION' });
});

test('reordering equivalent checker wiring does not invalidate architecture checks', () => {
  const dependenciesReordered = original.replace(
    'contract, violations, execFileSync, runnerSmokeTimeoutMs,\n  preflightNegativeSmokeScenarios,',
    'preflightNegativeSmokeScenarios, contract, violations, execFileSync,\n  runnerSmokeTimeoutMs,',
  );
  assert.notEqual(dependenciesReordered, original, 'test must actually reorder injected dependencies');
  const bindingsReordered = dependenciesReordered.replace(
    'validateRunnerPreflightNegativeSmokes,\n  validateRunnerPreflightPositiveSmoke,',
    'validateRunnerPreflightPositiveSmoke,\n  validateRunnerPreflightNegativeSmokes,',
  );
  assert.notEqual(bindingsReordered, dependenciesReordered, 'test must reorder returned bindings');
  assertActiveDelegation(bindingsReordered);
});

test('a missing injected helper dependency fails the architecture guard', () => {
  const missingDependency = original.replace(
    'childProcessErrorOutput, smokeOutputSnippet,\n});\nconst { validateRunnerOutputRedactionSmoke',
    'childProcessErrorOutput,\n});\nconst { validateRunnerOutputRedactionSmoke',
  );
  assert.notEqual(missingDependency, original, 'test must actually remove a dependency');
  assert.throws(() => assertActiveDelegation(missingDependency), { code: 'ERR_ASSERTION' });
});

test('CRLF checkouts preserve active delegation and still reject disabled invocations', () => {
  const crlf = original.replace(/\r?\n/g, '\r\n');
  const crlfHelper = extracted.replace(/\r?\n/g, '\r\n');
  assertActiveDelegation(crlf, crlfHelper);
  assert.throws(() => assertActiveDelegation(crlf, crlfHelper.replace(statement, '// ' + statement)));
});
