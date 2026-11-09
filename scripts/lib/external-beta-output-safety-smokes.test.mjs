import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import test from 'node:test';
import { createExternalBetaOutputSafetySmokes } from './external-beta-output-safety-smokes.mjs';

const runnerFile = 'scripts/external-beta-evidence-runner.mjs';

function harness(execFileSync, envFactory = (_directory) => ({ FIXTURE_VALUE: 'fixture-value' })) {
  const violations = [];
  const smokes = createExternalBetaOutputSafetySmokes({
    contract: { runnerFile },
    violations,
    completeExternalEvidencePreflightEnv: envFactory,
    execFileSync,
    runnerSmokeTimeoutMs: 30_000,
    childProcessErrorOutput: (error) => String(error.stdout ?? error.message ?? ''),
    smokeOutputSnippet: (output) => String(output).trim(),
  });
  return { ...smokes, violations };
}

test('four plan/summary/handoff redaction smokes retain bounded isolated process env', () => {
  const calls = [];
  const h = harness((binary, args, options) => {
    calls.push({ binary, args, options });
    return 'safe redacted output';
  });
  h.validateRunnerOutputRedactionSmoke();
  assert.deepEqual(h.violations, []);
  assert.deepEqual(calls.map(({ args }) => args.slice(1)), [
    ['--plan', '--json'], ['--summary'], ['--handoff'], ['--handoff-json'],
  ]);
  for (const call of calls) {
    assert.equal(call.binary, process.execPath);
    assert.equal(call.args[0], runnerFile);
    assert.equal(call.options.timeout, 30_000);
    assert.equal(call.options.stdio, 'pipe');
    assert.equal(call.options.encoding, 'utf8');
    assert.equal(call.options.env.FIXTURE_VALUE, 'fixture-value');
    assert.match(call.options.env.API_BASE_URL, /runtime-api-token-value-1234567890/);
    assert.equal(call.options.env.REDDIT_CLIENT_SECRET, 'reddit-runtime-client-secret-value-1234567890');
    assert.equal(call.options.env.REDDIT_REFRESH_TOKEN, 'reddit-runtime-refresh-value-1234567890');
    assert.deepEqual(Object.keys(call.options.env).sort(), [
      'API_BASE_URL', 'DATABASE_URL', 'FIXTURE_VALUE', 'PATH', 'RABBITMQ_URL',
      'REDDIT_ACCESS_TOKEN', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN',
    ]);
  }
});

test('redaction smoke rejects secrets and private database endpoints in output', () => {
  const h = harness(() => 'reddit-runtime-client-secret-value-1234567890 127.0.0.1:54329');
  h.validateRunnerOutputRedactionSmoke();
  assert.equal(h.violations.length, 8);
  assert.equal(h.violations.filter(x => x.includes('reddit-runtime-client-secret-value-1234567890')).length, 4);
  assert.equal(h.violations.filter(x => x.includes('127.0.0.1:54329')).length, 4);
});

test('env-file smoke preserves private mode, shell quoting, conflict and confirmation failures', () => {
  const calls = [];
  const paths = [];
  const h = harness((_binary, args) => {
    const envPaths = args.flatMap((value, index) => value === '--env-file' ? [args[index + 1]] : []);
    const files = envPaths.map((path) => {
      paths.push(path);
      return { content: readFileSync(path, 'utf8'), mode: statSync(path).mode & 0o777 };
    });
    calls.push({ args, files });
    if (calls.length === 1) return 'External evidence env readiness: 13/13 live/manual jobs (100%)';
    if (calls.length === 2) throw { status: 1, stdout: 'value conflicts with existing input' };
    if (calls.length === 3) throw { status: 1, stdout: 'EXTERNAL_BETA_EVIDENCE_CONFIRM must be set explicitly in the operator shell' };
    throw Error('unexpected smoke call');
  }, () => ({ NAME: "it's private", API_BASE_URL: 'http://127.0.0.1:3000' }));
  h.validateRunnerEnvFileSmokes();
  assert.deepEqual(h.violations, []);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].files[0].content.includes("NAME='it'\\''s private'"));
  assert.ok(calls[0].files[0].content.includes("API_BASE_URL='http://127.0.0.1:3000'"));
  assert.equal(calls[1].files.length, 2);
  assert.ok(calls[1].files[1].content.includes("BACKEND_IMAGE_DIGEST='sha256:"));
  assert.ok(calls[2].files[0].content.includes("EXTERNAL_BETA_EVIDENCE_CONFIRM='run-live'"));
  assert.ok(calls.every(call => call.files.every(file => file.mode === 0o600)));
  assert.ok(paths.every(path => !existsSync(path)), 'temporary private env files must be removed');
});

test('env-file smokes fail closed if conflict or confirmation is accepted', () => {
  const h = harness(() => 'External evidence env readiness: 13/13 live/manual jobs (100%)');
  h.validateRunnerEnvFileSmokes();
  assert.equal(h.violations.length, 2);
  assert.match(h.violations[0], /conflict smoke must reject conflicting values/);
  assert.match(h.violations[1], /confirmation smoke must reject live execution confirmation/);
});

test('subprocess failures stay visible as bounded redaction violations', () => {
  const h = harness(() => { throw { status: 1, stdout: 'safe subprocess failure' }; });
  h.validateRunnerOutputRedactionSmoke();
  assert.equal(h.violations.length, 4);
  for (const violation of h.violations) assert.match(violation, /redaction smoke must succeed: safe subprocess failure/);
});
