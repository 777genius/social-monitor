import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { preflightNegativeSmokeScenarios } from './external-beta-preflight-negative-smoke-scenarios.mjs';

const expected = [
  "raw OIDC_TEST_TOKEN_REF secret value",
  "mutable backend image digest",
  "local API base URL",
  "workspace evidence artifact path",
  "world-readable preflight evidence artifact",
  "invalid Postgres URL",
  "invalid RabbitMQ URL",
  "placeholder Reddit access token"
];
const expectedJobs = [
  'durable-backend-e2e-loop',
  'durable-backend-e2e-loop',
  'durable-backend-e2e-loop',
  'durable-backend-e2e-loop',
  'durable-backend-e2e-loop',
  'postgres-restore-migration-drill',
  'rabbitmq-staging-reliability-drill',
  'live-reddit-oauth',
];

test('original eight negative preflight identities and job contracts remain ordered', () => {
  const scenarios = preflightNegativeSmokeScenarios();
  assert.deepEqual(scenarios.map(x => x.label), expected);
  assert.deepEqual(scenarios.map(x => x.jobId), expectedJobs);
  assert.ok(scenarios.every(x => Array.isArray(x.expectedOutput) && x.expectedOutput.length === 2 && typeof x.env === 'function'));
  assert.equal(new Set(scenarios.map(x => x.label)).size, 8);
  assert.notStrictEqual(scenarios, preflightNegativeSmokeScenarios());
});

test('OIDC secret-reference rejection still passes the original raw non-placeholder negative value', () => {
  const env = preflightNegativeSmokeScenarios()[0].env('fixture-path');
  assert.equal(env.OIDC_TEST_TOKEN_REF, ['bea', 'rer raw-secret-reference-should-fail'].join(''));
  assert.deepEqual(preflightNegativeSmokeScenarios()[0].expectedOutput, ['OIDC_TEST_TOKEN_REF', 'non-placeholder secret reference']);
});

test('immutable-image and local-API negatives preserve original invalid inputs and diagnostics', () => {
  const cases = preflightNegativeSmokeScenarios();
  assert.equal(cases[1].env('fixture-path').BACKEND_IMAGE_DIGEST, 'sha256:not-a-real-digest');
  assert.deepEqual(cases[1].expectedOutput, ['BACKEND_IMAGE_DIGEST', 'immutable sha256 image digest']);
  assert.equal(cases[2].env('fixture-path').API_BASE_URL, 'https://localhost/internal');
  assert.deepEqual(cases[2].expectedOutput, ['API_BASE_URL', 'must not use local']);
});

test('workspace evidence path remains the same absolute policy violation', () => {
  const scenario = preflightNegativeSmokeScenarios()[3];
  const actual = scenario.env('fixture-path').DURABLE_BACKEND_E2E_ARTIFACT_PATH;
  assert.equal(actual, join(process.cwd(), 'durable-backend-e2e.json'));
  assert.deepEqual(scenario.expectedOutput, ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', 'inside the git workspace']);
});

test('world-readable artifact fixture creation is deferred until the original env invocation', () => {
  const root = mkdtempSync(join(tmpdir(), 'external-beta-preflight-negative-tests-'));
  try {
    const scenarios = preflightNegativeSmokeScenarios();
    const path = join(root, 'durable-backend-e2e.json');
    assert.equal(existsSync(path), false);
    const env = scenarios[4].env(root);
    assert.equal(env.DURABLE_BACKEND_E2E_ARTIFACT_PATH, path);
    assert.equal(readFileSync(path, 'utf8'), '{}\n');
    // Windows stat reports only read-only/writable attributes, not POSIX permission bits.
    if (process.platform !== 'win32') {
      assert.equal(statSync(path).mode & 0o777, 0o644);
    }
    assert.deepEqual(scenarios[4].expectedOutput, ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', '0600-style private file permissions before preflight']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid PostgreSQL and RabbitMQ protocols preserve source fixture restrictions', () => {
  const scenarios = preflightNegativeSmokeScenarios();
  assert.equal(scenarios[5].env('fixture-path').DATABASE_URL, 'https://db.staging.social-monitor.invalid');
  assert.deepEqual(scenarios[5].expectedOutput, ['DATABASE_URL', 'valid PostgreSQL URL']);
  assert.equal(scenarios[6].env('fixture-path').RABBITMQ_URL, 'https://rabbitmq.staging.social-monitor.invalid');
  assert.deepEqual(scenarios[6].expectedOutput, ['RABBITMQ_URL', 'valid RabbitMQ URL']);
});

test('placeholder Reddit token retains original negative contract', () => {
  const scenario = preflightNegativeSmokeScenarios()[7];
  assert.equal(scenario.env('fixture-path').REDDIT_ACCESS_TOKEN, 'placeholder');
  assert.deepEqual(scenario.expectedOutput, ['REDDIT_ACCESS_TOKEN', 'non-placeholder secret value']);
});
