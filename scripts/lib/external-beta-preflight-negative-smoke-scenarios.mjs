// Synthetic negative preflight fixture declarations; side effects occur only when env(tempDirectory) is called.
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  durableBackendE2ePreflightEnv,
  postgresRestorePreflightEnv,
  rabbitmqDrillPreflightEnv,
  redditOAuthPreflightEnv,
} from './external-beta-evidence-preflight-fixtures.mjs';

/** Return fresh negative preflight cases while preserving the original file setup timing and diagnostics. */
export function preflightNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'raw OIDC_TEST_TOKEN_REF secret value',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['OIDC_TEST_TOKEN_REF', 'non-placeholder secret reference'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        OIDC_TEST_TOKEN_REF: 'bea' + 'rer raw-secret-reference-should-fail',
      }),
    },
    {
      label: 'mutable backend image digest',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['BACKEND_IMAGE_DIGEST', 'immutable sha256 image digest'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        BACKEND_IMAGE_DIGEST: 'sha256:not-a-real-digest',
      }),
    },
    {
      label: 'local API base URL',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['API_BASE_URL', 'must not use local'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        API_BASE_URL: 'https://localhost/internal',
      }),
    },
    {
      label: 'workspace evidence artifact path',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', 'inside the git workspace'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(process.cwd(), 'durable-backend-e2e.json'),
      }),
    },
    {
      label: 'world-readable preflight evidence artifact',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', '0600-style private file permissions before preflight'],
      env: (tempDirectory) => {
        const artifactPath = join(tempDirectory, 'durable-backend-e2e.json');
        writeFileSync(artifactPath, '{}\n', { mode: 0o600 });
        chmodSync(artifactPath, 0o644);
        return durableBackendE2ePreflightEnv(tempDirectory, {
          DURABLE_BACKEND_E2E_ARTIFACT_PATH: artifactPath,
        });
      },
    },
    {
      label: 'invalid Postgres URL',
      jobId: 'postgres-restore-migration-drill',
      expectedOutput: ['DATABASE_URL', 'valid PostgreSQL URL'],
      env: (tempDirectory) => postgresRestorePreflightEnv(tempDirectory, {
        DATABASE_URL: 'https://db.staging.social-monitor.invalid',
      }),
    },
    {
      label: 'invalid RabbitMQ URL',
      jobId: 'rabbitmq-staging-reliability-drill',
      expectedOutput: ['RABBITMQ_URL', 'valid RabbitMQ URL'],
      env: (tempDirectory) => rabbitmqDrillPreflightEnv(tempDirectory, {
        RABBITMQ_URL: 'https://rabbitmq.staging.social-monitor.invalid',
      }),
    },
    {
      label: 'placeholder Reddit access token',
      jobId: 'live-reddit-oauth',
      expectedOutput: ['REDDIT_ACCESS_TOKEN', 'non-placeholder secret value'],
      env: (tempDirectory) => redditOAuthPreflightEnv(tempDirectory, {
        REDDIT_ACCESS_TOKEN: 'placeholder',
      }),
    },
  ];

  return scenarios;
}
