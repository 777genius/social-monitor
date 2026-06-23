import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  assertDurableAutomaticLoopExternalEnv,
  restartBackendServices,
  runNodeScript,
  runNpmScript,
  withDockerBackendEvidenceStack,
} from './lib/docker-backend-evidence-harness.mjs';
import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  process.env.STAGING_RELIABILITY_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const artifactRoot = resolve(artifactDir);
const durableRuntimePath =
  process.env.DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH ??
  join(artifactRoot, 'durable-runtime-selector.json');
const rabbitmqPath =
  process.env.RABBITMQ_STAGING_DRILL_ARTIFACT_PATH ??
  join(artifactRoot, 'rabbitmq-staging-drill.json');
const postgresPath =
  process.env.POSTGRES_RESTORE_DRILL_ARTIFACT_PATH ??
  join(artifactRoot, 'postgres-restore-drill.json');
const durableBackendPath =
  process.env.DURABLE_BACKEND_E2E_ARTIFACT_PATH ??
  join(artifactRoot, 'durable-backend-e2e-loop.json');
const sourceCredentialRotationPath =
  process.env.SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH ??
  join(artifactRoot, 'source-credential-rotation.json');
const webhookSecretRotationPath =
  process.env.WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH ??
  join(artifactRoot, 'webhook-secret-rotation.json');
const securityFinalSweepPath =
  process.env.SECURITY_FINAL_SWEEP_ARTIFACT_PATH ??
  join(artifactRoot, 'security-final-sweep.json');
const logExportPath =
  process.env.LOG_EXPORT_PATH ??
  join(artifactRoot, 'security-logs-export.json');
const metricsExportPath =
  process.env.METRICS_EXPORT_PATH ??
  join(artifactRoot, 'security-metrics-export.json');
const publicErrorExportPath =
  process.env.PUBLIC_ERROR_EXPORT_PATH ??
  join(artifactRoot, 'security-public-errors-export.json');
const releaseDeploySmokePath =
  process.env.RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH ??
  join(artifactRoot, 'release-deploy-smoke.json');
const bundlePath =
  process.env.BACKEND_STAGING_EVIDENCE_BUNDLE_PATH ??
  join(artifactRoot, 'backend-staging-evidence-bundle.json');
const envFilePath =
  process.env.BACKEND_STAGING_EVIDENCE_ENV_PATH ??
  join(artifactRoot, 'backend-staging-evidence.env');

const durableRuntimeTarget = validateEvidenceJsonFilePath(
  durableRuntimePath,
  'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH',
);
const rabbitmqTarget = validateEvidenceJsonFilePath(
  rabbitmqPath,
  'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
);
const postgresTarget = validateEvidenceJsonFilePath(
  postgresPath,
  'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
);
const durableBackendTarget = validateEvidenceJsonFilePath(
  durableBackendPath,
  'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
);
const sourceCredentialRotationTarget = validateEvidenceJsonFilePath(
  sourceCredentialRotationPath,
  'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
);
const webhookSecretRotationTarget = validateEvidenceJsonFilePath(
  webhookSecretRotationPath,
  'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH',
);
const securityFinalSweepTarget = validateEvidenceJsonFilePath(
  securityFinalSweepPath,
  'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
);
const logExportTarget = validateEvidenceJsonFilePath(logExportPath, 'LOG_EXPORT_PATH');
const metricsExportTarget = validateEvidenceJsonFilePath(metricsExportPath, 'METRICS_EXPORT_PATH');
const publicErrorExportTarget = validateEvidenceJsonFilePath(publicErrorExportPath, 'PUBLIC_ERROR_EXPORT_PATH');
const releaseDeploySmokeTarget = validateEvidenceJsonFilePath(
  releaseDeploySmokePath,
  'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH',
);
const bundleTarget = validateEvidenceJsonFilePath(
  bundlePath,
  'BACKEND_STAGING_EVIDENCE_BUNDLE_PATH',
);
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
assertDurableAutomaticLoopExternalEnv();
const commitSha = readGitCommitSha();

await withDockerBackendEvidenceStack({
  projectEnvName: 'BACKEND_STAGING_EVIDENCE_COMPOSE_PROJECT',
  projectPrefix: 'social-monitor-backend-evidence',
  keepEnvNames: ['KEEP_DOCKER_BACKEND_STAGING_EVIDENCE_STACK'],
}, async (context) => {
  const env = {
    ...context.runnerEnv,
    BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundleTarget,
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: durableBackendTarget,
    DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: durableRuntimeTarget,
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: postgresTarget,
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: rabbitmqTarget,
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceCredentialRotationTarget,
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookSecretRotationTarget,
    SECURITY_FINAL_SWEEP_ARTIFACT_PATH: securityFinalSweepTarget,
    LOG_EXPORT_PATH: logExportTarget,
    METRICS_EXPORT_PATH: metricsExportTarget,
    PUBLIC_ERROR_EXPORT_PATH: publicErrorExportTarget,
    RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: releaseDeploySmokeTarget,
    STAGING_SECRET_STORE_ID: process.env.STAGING_SECRET_STORE_ID ?? `${context.environmentId}-secret-store`,
    STAGING_RELIABILITY_ARTIFACT_DIR: artifactRoot,
  };

  runNpmScript('capture:credential-secret-runtime-flow', env);
  runNpmScript('capture:security-final-sweep', env);
  runNodeScript('scripts/capture-docker-durable-runtime-proof.mjs', env);
  runNodeScript('scripts/capture-docker-staging-reliability-evidence.mjs', env);

  restartBackendServices(context);
  runNpmScript('capture:release-deploy-smoke', env);
  runNpmScript('capture:durable-backend-e2e-loop', env);

  runNpmScript('check:durable-runtime-proof', env);
  runNpmScript('check:staging-reliability-evidence', env);

  writeBundleSummary({
    bundlePath: bundleTarget,
    envFilePath: envFileTarget,
    context,
    commitSha,
    artifactPaths: {
      durableRuntimePath: durableRuntimeTarget,
      rabbitmqPath: rabbitmqTarget,
      postgresPath: postgresTarget,
      durableBackendPath: durableBackendTarget,
      sourceCredentialRotationPath: sourceCredentialRotationTarget,
      webhookSecretRotationPath: webhookSecretRotationTarget,
      securityFinalSweepPath: securityFinalSweepTarget,
      releaseDeploySmokePath: releaseDeploySmokeTarget,
    },
  });
  writeBundleEnvFile({
    envFilePath: envFileTarget,
    env,
    commitSha,
    artifactPaths: {
      durableRuntimePath: durableRuntimeTarget,
      rabbitmqPath: rabbitmqTarget,
      postgresPath: postgresTarget,
      durableBackendPath: durableBackendTarget,
      sourceCredentialRotationPath: sourceCredentialRotationTarget,
      webhookSecretRotationPath: webhookSecretRotationTarget,
      securityFinalSweepPath: securityFinalSweepTarget,
      logExportPath: logExportTarget,
      metricsExportPath: metricsExportTarget,
      publicErrorExportPath: publicErrorExportTarget,
      releaseDeploySmokePath: releaseDeploySmokeTarget,
      bundlePath: bundleTarget,
    },
  });
  runNpmScript('check:docker-backend-staging-evidence-bundle', env);

  console.log(`DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH=${durableRuntimeTarget}`);
  console.log(`RABBITMQ_STAGING_DRILL_ARTIFACT_PATH=${rabbitmqTarget}`);
  console.log(`POSTGRES_RESTORE_DRILL_ARTIFACT_PATH=${postgresTarget}`);
  console.log(`DURABLE_BACKEND_E2E_ARTIFACT_PATH=${durableBackendTarget}`);
  console.log(`SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH=${sourceCredentialRotationTarget}`);
  console.log(`WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH=${webhookSecretRotationTarget}`);
  console.log(`SECURITY_FINAL_SWEEP_ARTIFACT_PATH=${securityFinalSweepTarget}`);
  console.log(`LOG_EXPORT_PATH=${logExportTarget}`);
  console.log(`METRICS_EXPORT_PATH=${metricsExportTarget}`);
  console.log(`PUBLIC_ERROR_EXPORT_PATH=${publicErrorExportTarget}`);
  console.log(`RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH=${releaseDeploySmokeTarget}`);
  console.log(`BACKEND_STAGING_EVIDENCE_BUNDLE_PATH=${bundleTarget}`);
  console.log(`BACKEND_STAGING_EVIDENCE_ENV_PATH=${envFileTarget}`);
});

function writeBundleSummary({ bundlePath, envFilePath, context, commitSha, artifactPaths }) {
  const artifacts = [
    artifactSummary('durable-runtime-selector', artifactPaths.durableRuntimePath),
    artifactSummary('rabbitmq-staging-drill-output', artifactPaths.rabbitmqPath),
    artifactSummary('postgres-restore-drill-output', artifactPaths.postgresPath),
    artifactSummary('durable-backend-e2e-output', artifactPaths.durableBackendPath),
    artifactSummary('source-credential-rotation', artifactPaths.sourceCredentialRotationPath),
    artifactSummary('webhook-secret-rotation', artifactPaths.webhookSecretRotationPath),
    artifactSummary('security-final-sweep', artifactPaths.securityFinalSweepPath),
    artifactSummary('release-deploy-smoke', artifactPaths.releaseDeploySmokePath),
  ];
  const bundle = {
    schemaVersion: 1,
    format: 'docker-backend-staging-evidence-bundle-v1',
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    environmentId: context.environmentId,
    imageDigest: context.imageDigest,
    commitSha,
    apiBaseUrl: context.apiBaseUrl,
    operator: context.operator,
    envFilePath,
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

  mkdirSync(dirname(bundlePath), { recursive: true });
  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
  chmodSync(bundlePath, 0o600);
}

function writeBundleEnvFile({ envFilePath, env, commitSha, artifactPaths }) {
  writeEvidenceEnvFile(envFilePath, [
    ['API_BASE_URL', env.API_BASE_URL],
    ['BACKEND_IMAGE_DIGEST', env.BACKEND_IMAGE_DIGEST],
    ['BACKEND_GIT_COMMIT_SHA', commitSha],
    ['DATABASE_URL', env.DATABASE_URL],
    ['RABBITMQ_URL', env.RABBITMQ_URL],
    ['RABBITMQ_MANAGEMENT_URL', env.RABBITMQ_MANAGEMENT_URL],
    ['STAGING_ENVIRONMENT_ID', env.STAGING_ENVIRONMENT_ID],
    ['STAGING_OPERATOR', env.STAGING_OPERATOR],
    ['STAGING_SECRET_STORE_ID', env.STAGING_SECRET_STORE_ID],
    ['DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', artifactPaths.durableRuntimePath],
    ['RABBITMQ_STAGING_DRILL_ARTIFACT_PATH', artifactPaths.rabbitmqPath],
    ['POSTGRES_RESTORE_DRILL_ARTIFACT_PATH', artifactPaths.postgresPath],
    ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', artifactPaths.durableBackendPath],
    ['SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', artifactPaths.sourceCredentialRotationPath],
    ['WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', artifactPaths.webhookSecretRotationPath],
    ['SECURITY_FINAL_SWEEP_ARTIFACT_PATH', artifactPaths.securityFinalSweepPath],
    ['LOG_EXPORT_PATH', artifactPaths.logExportPath],
    ['METRICS_EXPORT_PATH', artifactPaths.metricsExportPath],
    ['PUBLIC_ERROR_EXPORT_PATH', artifactPaths.publicErrorExportPath],
    ['RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH', artifactPaths.releaseDeploySmokePath],
    ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH', artifactPaths.bundlePath],
  ], {
    usageLines: [
      'Usage:',
      `set -a; . ${shellQuote(envFilePath)}; set +a`,
      'npm run check:docker-backend-staging-evidence-bundle',
      'npm run check:durable-runtime-proof && npm run check:staging-reliability-evidence && npm run check:credential-secret-runtime-flow && npm run check:security-final-sweep && npm run check:release-artifact-evidence',
      'This local Docker handoff intentionally does not include live source, Reddit, or summary feedback evidence paths.',
      'Do not use this local Docker env as full external beta validate input: local http, Postgres and RabbitMQ URLs must stay rejected by production evidence preflight.',
    ],
  });
}

function readGitCommitSha() {
  const value = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error('git HEAD must resolve to a full commit SHA before capturing Docker backend evidence');
  }
  return value;
}

function artifactSummary(artifactId, path) {
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  const signalResults = Array.isArray(artifact.signalResults) ? artifact.signalResults : [];
  const operations = Array.isArray(artifact.operations) ? artifact.operations : [];
  const surfaces = Array.isArray(artifact.surfaces) ? artifact.surfaces : [];
  const sourceExports = Array.isArray(artifact.sourceExports) ? artifact.sourceExports : [];
  const smokeResults = Array.isArray(artifact.smokeResults) ? artifact.smokeResults : [];

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
    smokeIds: smokeResults.map((result) => result.smokeId).filter((smokeId) => typeof smokeId === 'string'),
    smokeCount: smokeResults.length,
  };
}
