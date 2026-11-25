import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import {
  completeExternalEvidencePreflightEnv,
  durableBackendE2ePreflightEnv,
  postgresRestorePreflightEnv,
  rabbitmqDrillPreflightEnv,
  redditOAuthPreflightEnv,
} from './external-beta-evidence-preflight-fixtures.mjs';

const tempDirectory = join('tmp', 'external beta evidence preflight');

test('durable backend preflight retains defaults and overrides only at the end', () => {
  const defaults = durableBackendE2ePreflightEnv(tempDirectory);
  assert.equal(Object.keys(defaults).length, 6);
  assert.equal(defaults.BACKEND_IMAGE_DIGEST, 'sha256:' + 'b'.repeat(64));
  assert.equal(defaults.DURABLE_BACKEND_E2E_ARTIFACT_PATH, join(tempDirectory, 'durable-backend-e2e.json'));
  assert.equal(defaults.INFINITY_CONTEXT_TOKEN, 'secret-ref:infinity-context-token');
  const changed = durableBackendE2ePreflightEnv(tempDirectory, { STAGING_ENVIRONMENT_ID: 'test-override', EXTRA: '1' });
  assert.equal(changed.STAGING_ENVIRONMENT_ID, 'test-override');
  assert.equal(changed.EXTRA, '1');
  assert.equal(defaults.STAGING_ENVIRONMENT_ID, 'staging-alpha-1');
});

test('postgres restore preflight retains isolated database and artifact configuration', () => {
  const defaults = postgresRestorePreflightEnv(tempDirectory);
  assert.equal(Object.keys(defaults).length, 4);
  assert.equal(defaults.BACKEND_IMAGE_DIGEST, 'sha256:' + 'c'.repeat(64));
  assert.equal(defaults.POSTGRES_RESTORE_DRILL_ARTIFACT_PATH, join(tempDirectory, 'postgres-restore-drill.json'));
  assert.match(defaults.DATABASE_URL, /^postgresql:\/\//);
  assert.equal(postgresRestorePreflightEnv(tempDirectory, { DATABASE_URL: 'replaced' }).DATABASE_URL, 'replaced');
});

test('RabbitMQ drill preflight retains path, broker and override semantics', () => {
  const defaults = rabbitmqDrillPreflightEnv(tempDirectory);
  assert.equal(Object.keys(defaults).length, 4);
  assert.equal(defaults.BACKEND_IMAGE_DIGEST, 'sha256:' + 'd'.repeat(64));
  assert.equal(defaults.RABBITMQ_STAGING_DRILL_ARTIFACT_PATH, join(tempDirectory, 'rabbitmq-staging-drill.json'));
  assert.match(defaults.RABBITMQ_URL, /^amqps:\/\//);
  assert.equal(rabbitmqDrillPreflightEnv(tempDirectory, { RABBITMQ_URL: '' }).RABBITMQ_URL, '');
});

test('Reddit OAuth preflight retains token and lifecycle paths and supports refresh alternative', () => {
  const defaults = redditOAuthPreflightEnv(tempDirectory);
  assert.equal(Object.keys(defaults).length, 7);
  assert.equal(defaults.BACKEND_IMAGE_DIGEST, 'sha256:' + 'e'.repeat(64));
  assert.equal(defaults.BACKEND_GIT_COMMIT_SHA, 'e'.repeat(40));
  assert.equal(defaults.REDDIT_LIVE_EVIDENCE_PATH, join(tempDirectory, 'reddit-live-evidence.json'));
  assert.equal(defaults.REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH, join(tempDirectory, 'reddit-credential-lifecycle.json'));
  const alternative = redditOAuthPreflightEnv(tempDirectory, { REDDIT_ACCESS_TOKEN: '', REDDIT_REFRESH_TOKEN: 'fixture-refresh' });
  assert.equal(alternative.REDDIT_ACCESS_TOKEN, '');
  assert.equal(alternative.REDDIT_REFRESH_TOKEN, 'fixture-refresh');
  assert.equal(defaults.REDDIT_REFRESH_TOKEN, undefined);
});

test('complete preflight environment retains all required path and provider keys', () => {
  const env = completeExternalEvidencePreflightEnv(tempDirectory);
  assert.equal(Object.keys(env).length, 34);
  assert.equal(env.BACKEND_IMAGE_DIGEST, 'sha256:' + 'f'.repeat(64));
  assert.equal(env.BACKEND_GIT_COMMIT_SHA, 'f'.repeat(40));
  assert.equal(env.GITHUB_REPO_RADAR_PRISMA_LIVE_E2E, '1');
  assert.equal(env.RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE, 'prisma');
  assert.equal(env.SUMMARY_REAL_FEEDBACK_SAMPLES_PATH, join(tempDirectory, 'summary-real-feedback-samples.json'));
  assert.equal(env.WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH, join(tempDirectory, 'webhook-secret-rotation.json'));
  for (const [key, value] of Object.entries(env)) {
    if (key.endsWith('_PATH')) assert.equal(value.startsWith(tempDirectory), true, key);
  }
});

test('all preflight fixture builders remain deterministic for the same path', () => {
  for (const build of [durableBackendE2ePreflightEnv, postgresRestorePreflightEnv, rabbitmqDrillPreflightEnv, redditOAuthPreflightEnv, completeExternalEvidencePreflightEnv]) {
    assert.deepEqual(build(tempDirectory), build(tempDirectory));
  }
});
