import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  restartBackendServices,
  runNodeScript,
  runNpmScript,
  withDockerBackendEvidenceStack,
} from './lib/docker-backend-evidence-harness.mjs';

const artifactDir =
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  process.env.STAGING_RELIABILITY_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const durableRuntimePath =
  process.env.DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH ??
  join(artifactDir, 'durable-runtime-selector.json');
const rabbitmqPath =
  process.env.RABBITMQ_STAGING_DRILL_ARTIFACT_PATH ??
  join(artifactDir, 'rabbitmq-staging-drill.json');
const postgresPath =
  process.env.POSTGRES_RESTORE_DRILL_ARTIFACT_PATH ??
  join(artifactDir, 'postgres-restore-drill.json');
const durableBackendPath =
  process.env.DURABLE_BACKEND_E2E_ARTIFACT_PATH ??
  join(artifactDir, 'durable-backend-e2e-loop.json');
const sourceCredentialRotationPath =
  process.env.SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH ??
  join(artifactDir, 'source-credential-rotation.json');
const webhookSecretRotationPath =
  process.env.WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH ??
  join(artifactDir, 'webhook-secret-rotation.json');
const securityFinalSweepPath =
  process.env.SECURITY_FINAL_SWEEP_ARTIFACT_PATH ??
  join(artifactDir, 'security-final-sweep.json');
const logExportPath =
  process.env.LOG_EXPORT_PATH ??
  join(artifactDir, 'security-logs-export.json');
const metricsExportPath =
  process.env.METRICS_EXPORT_PATH ??
  join(artifactDir, 'security-metrics-export.json');
const publicErrorExportPath =
  process.env.PUBLIC_ERROR_EXPORT_PATH ??
  join(artifactDir, 'security-public-errors-export.json');
const bundlePath =
  process.env.BACKEND_STAGING_EVIDENCE_BUNDLE_PATH ??
  join(artifactDir, 'backend-staging-evidence-bundle.json');

mkdirSync(artifactDir, { recursive: true });

await withDockerBackendEvidenceStack({
  projectEnvName: 'BACKEND_STAGING_EVIDENCE_COMPOSE_PROJECT',
  projectPrefix: 'social-monitor-backend-evidence',
  keepEnvNames: ['KEEP_DOCKER_BACKEND_STAGING_EVIDENCE_STACK'],
}, async (context) => {
  const env = {
    ...context.runnerEnv,
    BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: durableBackendPath,
    DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: durableRuntimePath,
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: postgresPath,
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: rabbitmqPath,
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceCredentialRotationPath,
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookSecretRotationPath,
    SECURITY_FINAL_SWEEP_ARTIFACT_PATH: securityFinalSweepPath,
    LOG_EXPORT_PATH: logExportPath,
    METRICS_EXPORT_PATH: metricsExportPath,
    PUBLIC_ERROR_EXPORT_PATH: publicErrorExportPath,
    STAGING_SECRET_STORE_ID: process.env.STAGING_SECRET_STORE_ID ?? `${context.environmentId}-secret-store`,
    STAGING_RELIABILITY_ARTIFACT_DIR: artifactDir,
  };

  runNpmScript('capture:credential-secret-runtime-flow', env);
  runNpmScript('capture:security-final-sweep', env);
  runNodeScript('scripts/capture-docker-durable-runtime-proof.mjs', env);
  runNodeScript('scripts/capture-docker-staging-reliability-evidence.mjs', env);

  restartBackendServices(context);
  runNpmScript('capture:durable-backend-e2e-loop', env);

  runNpmScript('check:durable-runtime-proof', env);
  runNpmScript('check:staging-reliability-evidence', env);

  writeBundleSummary({
    bundlePath,
    context,
    artifactPaths: {
      durableRuntimePath,
      rabbitmqPath,
      postgresPath,
      durableBackendPath,
      sourceCredentialRotationPath,
      webhookSecretRotationPath,
      securityFinalSweepPath,
    },
  });

  console.log(`DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH=${durableRuntimePath}`);
  console.log(`RABBITMQ_STAGING_DRILL_ARTIFACT_PATH=${rabbitmqPath}`);
  console.log(`POSTGRES_RESTORE_DRILL_ARTIFACT_PATH=${postgresPath}`);
  console.log(`DURABLE_BACKEND_E2E_ARTIFACT_PATH=${durableBackendPath}`);
  console.log(`SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH=${sourceCredentialRotationPath}`);
  console.log(`WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH=${webhookSecretRotationPath}`);
  console.log(`SECURITY_FINAL_SWEEP_ARTIFACT_PATH=${securityFinalSweepPath}`);
  console.log(`LOG_EXPORT_PATH=${logExportPath}`);
  console.log(`METRICS_EXPORT_PATH=${metricsExportPath}`);
  console.log(`PUBLIC_ERROR_EXPORT_PATH=${publicErrorExportPath}`);
  console.log(`BACKEND_STAGING_EVIDENCE_BUNDLE_PATH=${bundlePath}`);
});

function writeBundleSummary({ bundlePath, context, artifactPaths }) {
  const artifacts = [
    artifactSummary('durable-runtime-selector', artifactPaths.durableRuntimePath),
    artifactSummary('rabbitmq-staging-drill-output', artifactPaths.rabbitmqPath),
    artifactSummary('postgres-restore-drill-output', artifactPaths.postgresPath),
    artifactSummary('durable-backend-e2e-output', artifactPaths.durableBackendPath),
    artifactSummary('source-credential-rotation', artifactPaths.sourceCredentialRotationPath),
    artifactSummary('webhook-secret-rotation', artifactPaths.webhookSecretRotationPath),
    artifactSummary('security-final-sweep', artifactPaths.securityFinalSweepPath),
  ];
  const bundle = {
    schemaVersion: 1,
    format: 'docker-backend-staging-evidence-bundle-v1',
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    environmentId: context.environmentId,
    imageDigest: context.imageDigest,
    apiBaseUrl: context.apiBaseUrl,
    operator: context.operator,
    generatedAt: new Date().toISOString(),
    provenance: {
      evidenceKind: 'docker_staging_bundle',
      collectionMethod: 'Isolated Docker Compose backend evidence bundle capture.',
      runner: 'scripts/capture-docker-backend-staging-evidence-bundle.mjs',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false,
      brokerUrlsIncluded: false,
    },
    artifacts,
  };

  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
}

function artifactSummary(artifactId, path) {
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  const signalResults = Array.isArray(artifact.signalResults) ? artifact.signalResults : [];
  const operations = Array.isArray(artifact.operations) ? artifact.operations : [];
  const surfaces = Array.isArray(artifact.surfaces) ? artifact.surfaces : [];
  const sourceExports = Array.isArray(artifact.sourceExports) ? artifact.sourceExports : [];

  return {
    artifactId,
    path,
    format: artifact.format ?? artifact.artifactFormat,
    signalIds: signalResults.map((signal) => signal.signalId).filter((signalId) => typeof signalId === 'string'),
    signalCount: signalResults.length,
    operationIds: operations.map((operation) => operation.operationId).filter((operationId) => typeof operationId === 'string'),
    operationCount: operations.length,
    surfaceIds: surfaces.map((surface) => surface.surfaceId).filter((surfaceId) => typeof surfaceId === 'string'),
    surfaceCount: surfaces.length,
    sourceExportCount: sourceExports.length,
  };
}
