import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExternalBetaPreflightCommandSmokes } from './external-beta-preflight-command-smokes.mjs';

function makeHarness({ scenarioResult = 'reject', positiveFailure = null, scenarios = null } = {}) {
  const calls = [];
  const violations = [];
  const cleanup = [];
  const scenarioList = scenarios ?? [{
    label: 'missing env',
    jobId: 'negative-case',
    env: (directory) => ({ CASE_DIRECTORY: directory }),
    expectedOutput: ['required environment missing'],
  }];
  let directoryCount = 0;
  const smokes = createExternalBetaPreflightCommandSmokes({
    contract: { runnerFile: 'synthetic-runner.mjs' },
    violations,
    execFileSync(binary, args, options) {
      calls.push({ binary, args, options });
      const negative = args.at(-1) === 'negative-case';
      const failingPositive = positiveFailure === 'all' ||
        (positiveFailure === 'reddit-app' && Object.hasOwn(options.env, 'REDDIT_APP_CLIENT_ID'));
      if ((negative && scenarioResult !== 'accept') || failingPositive) {
        const error = new Error('synthetic command failed');
        error.status = 7;
        error.stderr = negative && scenarioResult !== 'wrong-output'
          ? 'required environment missing'
          : 'synthetic rejected';
        throw error;
      }
      return '';
    },
    runnerSmokeTimeoutMs: 30_000,
    preflightNegativeSmokeScenarios: () => scenarioList,
    mkdtempSync: (prefix) => prefix + String(++directoryCount),
    tmpdir: () => '/synthetic-tmp',
    join: (...items) => items.join('/'),
    rmSync: (...args) => cleanup.push(args),
    completeExternalEvidencePreflightEnv: (directory) => ({ CASE_DIRECTORY: directory, COMPLETE: 'yes' }),
    redditOAuthPreflightEnv: (directory, env) => ({ ...env, CASE_DIRECTORY: directory }),
    childProcessErrorOutput: (error) => String(error.stderr ?? error.message),
    smokeOutputSnippet: (output) => String(output).slice(0, 120),
  });
  return { calls, violations, cleanup, smokes };
}

function assertChildContract(calls) {
  for (const { binary, args, options } of calls) {
    assert.equal(binary, process.execPath);
    assert.equal(args[0], 'synthetic-runner.mjs');
    assert.equal(args[1], '--require-env');
    assert.equal(options.timeout, 30_000);
    assert.equal(options.encoding, 'utf8');
    assert.equal(options.stdio, 'pipe');
    assert.equal(options.env.PATH, process.env.PATH ?? '');
    assert.equal(Object.hasOwn(options.env, 'HOME'), false);
  }
}

test('negative preflight rejects invalid environment and preserves child invocation', () => {
  const h = makeHarness();
  h.smokes.validateRunnerPreflightNegativeSmokes();
  assert.deepEqual(h.violations, []);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].args, ['synthetic-runner.mjs', '--require-env', '--job', 'negative-case']);
  assert.equal(h.cleanup.length, 1);
  assertChildContract(h.calls);
});

test('negative preflight fails closed when runner incorrectly succeeds', () => {
  const h = makeHarness({ scenarioResult: 'accept' });
  h.smokes.validateRunnerPreflightNegativeSmokes();
  assert.ok(h.violations.some((violation) => violation.includes('must reject missing env')));
  assert.equal(h.cleanup.length, 1);
});

test('negative preflight requires exact expected diagnostic evidence', () => {
  const h = makeHarness({ scenarioResult: 'wrong-output' });
  h.smokes.validateRunnerPreflightNegativeSmokes();
  assert.ok(h.violations.some((violation) => violation.includes('must report')));
  assert.equal(h.cleanup.length, 1);
});

test('negative preflight always cleans temporary files after scenario setup throws', () => {
  const h = makeHarness({ scenarios: [{
    label: 'setup error', jobId: 'negative-case', expectedOutput: [],
    env: () => { throw new Error('synthetic scenario setup failed'); },
  }] });
  assert.throws(() => h.smokes.validateRunnerPreflightNegativeSmokes(), /synthetic scenario setup failed/);
  assert.equal(h.cleanup.length, 1);
});

test('positive preflight validates ordinary and both Reddit refresh-token alternatives', () => {
  const h = makeHarness();
  h.smokes.validateRunnerPreflightPositiveSmoke();
  assert.deepEqual(h.violations, []);
  assert.equal(h.calls.length, 3);
  assert.equal(h.cleanup.length, 3);
  assert.deepEqual(h.calls[0].args, ['synthetic-runner.mjs', '--require-env']);
  for (const call of h.calls.slice(1)) {
    assert.deepEqual(call.args, ['synthetic-runner.mjs', '--require-env', '--job', 'live-reddit-oauth']);
    assert.equal(call.options.env.REDDIT_ACCESS_TOKEN, '');
  }
  assert.equal(h.calls[1].options.env.REDDIT_CLIENT_ID, 'reddit-client-id-prod-1');
  assert.equal(h.calls[2].options.env.REDDIT_APP_CLIENT_ID, 'reddit-app-client-id-prod-1');
  assertChildContract(h.calls);
});

test('positive preflight fails closed on an invalid Reddit app alternative', () => {
  const h = makeHarness({ positiveFailure: 'reddit-app' });
  h.smokes.validateRunnerPreflightPositiveSmoke();
  assert.equal(h.violations.length, 1);
  assert.ok(h.violations[0].includes('Reddit app refresh-token auth alternative'));
  assert.equal(h.cleanup.length, 3);
});

test('positive preflight failure reports redacted child output and retains cleanup', () => {
  const h = makeHarness({ positiveFailure: 'all' });
  h.smokes.validateRunnerPreflightPositiveSmoke();
  assert.equal(h.violations.length, 3);
  assert.ok(h.violations.every((violation) => violation.includes('synthetic rejected')));
  assert.equal(h.cleanup.length, 3);
  assertChildContract(h.calls);
});

test('positive preflight does not accidentally skip remaining variants after failure', () => {
  const h = makeHarness({ positiveFailure: 'all' });
  h.smokes.validateRunnerPreflightPositiveSmoke();
  assert.equal(h.calls.length, 3);
  assert.equal(h.cleanup.length, 3);
  assert.equal(h.calls[0].options.env.COMPLETE, 'yes');
  assert.equal(h.calls[1].options.env.REDDIT_REFRESH_TOKEN, 'reddit-refresh-token-value-1234567890');
  assert.equal(h.calls[2].options.env.REDDIT_REFRESH_TOKEN, 'reddit-refresh-token-value-1234567890');
});
