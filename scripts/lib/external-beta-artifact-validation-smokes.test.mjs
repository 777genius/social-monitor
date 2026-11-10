import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createExternalBetaArtifactValidationSmokes } from './external-beta-artifact-validation-smokes.mjs';

function harness(exec = () => undefined) {
  const calls = [];
  let digestReads = 0;
  const smokes = createExternalBetaArtifactValidationSmokes({
    contract: { runnerFile: 'runner-fixture.mjs' },
    execFileSync: (binary, args, options) => {
      calls.push({ binary, args, options });
      return exec(binary, args, options);
    },
    artifactValidationSmokeTimeoutMs: 300_000,
    releaseDeploySmokeImageDigest: () => {
      digestReads++;
      return 'sha256:' + 'd'.repeat(64);
    },
    childProcessErrorOutput: (error) => 'redacted:' + error.message,
  });
  return { smokes, calls, digestReads: () => digestReads };
}

function assertInvocation(h, invoke, job, env) {
  const before = h.calls.length;
  assert.deepEqual(invoke(), { exitCode: 0, output: '' });
  assert.equal(h.calls.length, before + 1);
  const { binary, args, options } = h.calls[before];
  assert.equal(binary, process.execPath);
  assert.deepEqual(args, ['runner-fixture.mjs', '--validate-artifacts', '--require-env', '--job', job]);
  assert.deepEqual(options.env, { PATH: process.env.PATH ?? '', ...env });
  assert.equal(options.encoding, 'utf8');
  assert.equal(options.stdio, 'pipe');
  assert.equal(options.timeout, 300_000);
}

test('negative smoke keeps original command argument insertion and timeout', () => {
  const h = harness();
  h.smokes.runRunnerNegativeSmoke('/tmp/live', { contractSmokeArtifactOnly: true });
  assert.deepEqual(h.calls[0].args, [
    'runner-fixture.mjs', '--validate-artifacts', '--contract-smoke-artifact-only',
    '--require-env', '--job', 'live-open-connectors',
  ]);
  assert.equal(h.calls[0].options.timeout, 300_000);
  assert.equal(Object.hasOwn(h.calls[0].options.env, 'HOME'), false);
});

test('all original smoke adapters preserve job IDs, env allowlist and timing', () => {
  const h = harness(), s = h.smokes;
  assertInvocation(h, () => s.runRunnerSecurityFinalSweepArtifactSmoke('/tmp/security', {
    logs: { path: '/tmp/logs' }, metrics: { path: '/tmp/metrics' },
    publicErrors: { path: '/tmp/errors' }, auditMetadata: { path: '/tmp/audit' },
  }), 'security-final-sweep-staging', {
    LOG_EXPORT_PATH: '/tmp/logs', METRICS_EXPORT_PATH: '/tmp/metrics',
    PUBLIC_ERROR_EXPORT_PATH: '/tmp/errors', AUDIT_EVENT_EXPORT_PATH: '/tmp/audit',
    SECURITY_FINAL_SWEEP_ARTIFACT_PATH: '/tmp/security',
  });
  assertInvocation(h, () => s.runRunnerCredentialRotationArtifactSmoke('/tmp/source', '/tmp/webhook'), 'credential-secret-rotation-drill', {
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: '/tmp/source',
    STAGING_SECRET_STORE_ID: 'secret-store-staging-alpha-1',
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: '/tmp/webhook',
  });
  assertInvocation(h, () => s.runRunnerDurableRuntimeArtifactSmoke('/tmp/durable'), 'durable-runtime-staging-proof', {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: 'sha256:' + 'd'.repeat(64),
    DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: '/tmp/durable',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
  });
  assertInvocation(h, () => s.runRunnerStagingReliabilityArtifactSmoke({
    jobId: 'synthetic-job', imageDigest: 'sha256:' + 'e'.repeat(64),
    envName: 'SYNTHETIC_PATH', requiredEnv: { SYNTHETIC_REQUIRED: 'yes' },
  }, '/tmp/staging'), 'synthetic-job', {
    BACKEND_IMAGE_DIGEST: 'sha256:' + 'e'.repeat(64),
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    SYNTHETIC_PATH: '/tmp/staging', SYNTHETIC_REQUIRED: 'yes',
  });
  assertInvocation(h, () => s.runRunnerSummaryFeedbackArtifactSmoke('/tmp/feedback'), 'summary-real-feedback-import', {
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: '/tmp/feedback',
  });
  assert.equal(h.digestReads(), 0);
  assertInvocation(h, () => s.runRunnerReleaseDeployArtifactSmoke('/tmp/release'), 'release-deploy-smoke', {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: 'sha256:' + 'd'.repeat(64),
    RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: '/tmp/release',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
  });
  assert.equal(h.digestReads(), 1);
  assertInvocation(h, () => s.runRunnerArtifactSmoke('/tmp/live'), 'live-open-connectors', {
    BACKEND_IMAGE_DIGEST: 'sha256:' + 'a'.repeat(64),
    BACKEND_GIT_COMMIT_SHA: 'a'.repeat(40),
    LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: '/tmp/live',
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-prod-alpha',
    SOURCE_LIVE_OPERATOR: 'release-operator-1',
  });
  assertInvocation(h, () => s.runRunnerRedditArtifactSmoke('/tmp/reddit', '/tmp/lifecycle'), 'live-reddit-oauth', {
    BACKEND_IMAGE_DIGEST: 'sha256:' + 'b'.repeat(64),
    BACKEND_GIT_COMMIT_SHA: 'b'.repeat(40),
    REDDIT_ACCESS_TOKEN: 'reddit-live-value-1234567890',
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: '/tmp/lifecycle',
    REDDIT_LIVE_EVIDENCE_PATH: '/tmp/reddit',
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-reddit-alpha',
    SOURCE_LIVE_OPERATOR: 'source-operator-1',
  });
});

test('child failures remain fail-closed and diagnostics are sanitized', () => {
  const error = new Error('fixture-status'); error.status = 17;
  assert.deepEqual(harness(() => { throw error; }).smokes.runRunnerArtifactSmoke('/tmp/x'),
    { exitCode: 17, output: 'redacted:fixture-status' });
  assert.deepEqual(harness(() => { throw new Error('fixture-fallback'); }).smokes.runRunnerArtifactSmoke('/tmp/x'),
    { exitCode: 1, output: 'redacted:fixture-fallback' });
});

test('original checker delegates once and keeps no parallel smoke owner', () => {
  const src = readFileSync(fileURLToPath(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url)), 'utf8');
  assert.equal(src.split('createExternalBetaArtifactValidationSmokes({').length - 1, 1);
  assert.equal(src.includes('function runRunnerValidateArtifactsSmoke('), false);
  assert.equal(src.includes('function runRunnerArtifactSmoke('), false);
});
