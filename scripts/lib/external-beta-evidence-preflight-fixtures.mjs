import { join } from 'node:path';

/** Construct deterministic durable-backend preflight fixture environment values. */
export function durableBackendE2ePreflightEnv(tempDirectory, overrides = {}) {
  return {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(tempDirectory, 'durable-backend-e2e.json'),
    INFINITY_CONTEXT_TOKEN: 'secret-ref:infinity-context-token',
    INFINITY_CONTEXT_URL: 'https://memory.staging.social-monitor.invalid',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    ...overrides,
  };
}

/** Construct deterministic PostgreSQL restore preflight fixture environment values. */
export function postgresRestorePreflightEnv(tempDirectory, overrides = {}) {
  return {
    BACKEND_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`,
    DATABASE_URL: 'postgresql://release:...@db.staging.social-monitor.invalid:5432/social_monitor',
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: join(tempDirectory, 'postgres-restore-drill.json'),
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    ...overrides,
  };
}

/** Construct deterministic RabbitMQ drill preflight fixture environment values. */
export function rabbitmqDrillPreflightEnv(tempDirectory, overrides = {}) {
  return {
    BACKEND_IMAGE_DIGEST: `sha256:${'d'.repeat(64)}`,
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: join(tempDirectory, 'rabbitmq-staging-drill.json'),
    RABBITMQ_URL: 'amqps://release:...@rabbitmq.staging.social-monitor.invalid:5671',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    ...overrides,
  };
}

/** Construct deterministic Reddit OAuth preflight fixture environment values. */
export function redditOAuthPreflightEnv(tempDirectory, overrides = {}) {
  return {
    BACKEND_IMAGE_DIGEST: `sha256:${'e'.repeat(64)}`,
    BACKEND_GIT_COMMIT_SHA: 'e'.repeat(40),
    REDDIT_ACCESS_TOKEN: 'reddit-live-access-value-1234567890',
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: join(tempDirectory, 'reddit-credential-lifecycle.json'),
    REDDIT_LIVE_EVIDENCE_PATH: join(tempDirectory, 'reddit-live-evidence.json'),
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
    SOURCE_LIVE_OPERATOR: 'source-operator-1',
    ...overrides,
  };
}

/** Construct deterministic complete external evidence preflight fixture environment values. */
export function completeExternalEvidencePreflightEnv(tempDirectory) {
  return {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: `sha256:${'f'.repeat(64)}`,
    BACKEND_GIT_COMMIT_SHA: 'f'.repeat(40),
    DATABASE_URL: 'postgresql://release:...@db.staging.social-monitor.invalid:5432/social_monitor',
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(tempDirectory, 'durable-backend-e2e.json'),
    DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: join(tempDirectory, 'durable-runtime-selector.json'),
    GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID: 'github-repo-radar-prod-project',
    GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH: join(tempDirectory, 'github-repo-radar-live-evidence.json'),
    GITHUB_REPO_RADAR_PRISMA_LIVE_E2E: '1',
    GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH: join(tempDirectory, 'github-trending-page-live-evidence.json'),
    INFINITY_CONTEXT_TOKEN: 'secret-ref:infinity-context-token',
    INFINITY_CONTEXT_URL: 'https://memory.staging.social-monitor.invalid',
    LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: join(tempDirectory, 'live-open-connectors.json'),
    AUDIT_EVENT_EXPORT_PATH: join(tempDirectory, 'security-audit-event-export.json'),
    LOG_EXPORT_PATH: join(tempDirectory, 'security-log-export.json'),
    METRICS_EXPORT_PATH: join(tempDirectory, 'security-metrics-export.json'),
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: join(tempDirectory, 'postgres-restore-drill.json'),
    PUBLIC_ERROR_EXPORT_PATH: join(tempDirectory, 'security-public-error-export.json'),
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: join(tempDirectory, 'rabbitmq-staging-drill.json'),
    RABBITMQ_URL: 'amqps://release:...@rabbitmq.staging.social-monitor.invalid:5671',
    REDDIT_ACCESS_TOKEN: 'reddit-live-access-value-1234567890',
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: join(tempDirectory, 'reddit-credential-lifecycle.json'),
    REDDIT_LIVE_EVIDENCE_PATH: join(tempDirectory, 'reddit-live-evidence.json'),
    RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH: join(tempDirectory, 'relevance-memory-runtime-canary.json'),
    RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE: 'prisma',
    RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: join(tempDirectory, 'release-deploy-smoke.json'),
    SECURITY_FINAL_SWEEP_ARTIFACT_PATH: join(tempDirectory, 'security-final-sweep.json'),
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: join(tempDirectory, 'source-credential-rotation.json'),
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
    SOURCE_LIVE_OPERATOR: 'source-operator-1',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    STAGING_SECRET_STORE_ID: 'secret-store-staging-alpha-1',
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: join(tempDirectory, 'summary-real-feedback-samples.json'),
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: join(tempDirectory, 'webhook-secret-rotation.json'),
  };
}
