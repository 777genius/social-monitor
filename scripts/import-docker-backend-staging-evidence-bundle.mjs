import { execFileSync } from 'node:child_process';
import { chmodSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  readPrivateEvidenceJsonFile,
  shellQuote,
  validateEvidenceEnvFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const bundlePath = process.env.BACKEND_STAGING_EVIDENCE_BUNDLE_PATH?.trim();
if (bundlePath === undefined || bundlePath.length === 0) {
  throw new Error('BACKEND_STAGING_EVIDENCE_BUNDLE_PATH is required');
}

const envFilePath = validateEvidenceEnvFilePath(
  process.env.EXTERNAL_BETA_EVIDENCE_ENV_PATH?.trim()
    || join(dirname(bundlePath), 'external-beta-evidence-from-docker-bundle.env'),
);

execFileSync('npm', ['run', 'check:docker-backend-staging-evidence-bundle'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
  },
});

const bundle = JSON.parse(readPrivateEvidenceJsonFile(bundlePath, 'BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'));
const artifactsById = new Map((bundle.artifacts ?? []).map((artifact) => [artifact.artifactId, artifact]));

assertBundleEnvelope(bundle);
assertRequiredArtifacts(artifactsById);

const securityArtifact = readArtifact(
  artifactPathFor(artifactsById, 'security-final-sweep'),
  'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
);
const sourceCredentialArtifact = readArtifact(
  artifactPathFor(artifactsById, 'source-credential-rotation'),
  'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
);
const securityExports = securityExportPaths(securityArtifact);

writeEvidenceEnvFile(envFilePath, [
  ['API_BASE_URL', bundle.apiBaseUrl],
  ['BACKEND_IMAGE_DIGEST', bundle.imageDigest],
  ['BACKEND_GIT_COMMIT_SHA', bundle.commitSha],
  ['STAGING_ENVIRONMENT_ID', bundle.environmentId],
  ['STAGING_OPERATOR', bundle.operator],
  ['STAGING_SECRET_STORE_ID', sourceCredentialArtifact.environment?.secretStoreId],
  ['DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', artifactPathFor(artifactsById, 'durable-runtime-selector')],
  ['RABBITMQ_STAGING_DRILL_ARTIFACT_PATH', artifactPathFor(artifactsById, 'rabbitmq-staging-drill-output')],
  ['POSTGRES_RESTORE_DRILL_ARTIFACT_PATH', artifactPathFor(artifactsById, 'postgres-restore-drill-output')],
  ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', artifactPathFor(artifactsById, 'durable-backend-e2e-output')],
  ['SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', artifactPathFor(artifactsById, 'source-credential-rotation')],
  ['WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', artifactPathFor(artifactsById, 'webhook-secret-rotation')],
  ['SECURITY_FINAL_SWEEP_ARTIFACT_PATH', artifactPathFor(artifactsById, 'security-final-sweep')],
  ['LOG_EXPORT_PATH', securityExports.get('LOG_EXPORT_PATH')],
  ['METRICS_EXPORT_PATH', securityExports.get('METRICS_EXPORT_PATH')],
  ['PUBLIC_ERROR_EXPORT_PATH', securityExports.get('PUBLIC_ERROR_EXPORT_PATH')],
  ['RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH', artifactPathFor(artifactsById, 'release-deploy-smoke')],
  ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH', bundlePath],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFilePath)}; set +a`,
    'npm run check:docker-backend-staging-evidence-bundle',
    'npm run check:durable-runtime-proof && npm run check:staging-reliability-evidence && npm run check:credential-secret-runtime-flow && npm run check:security-final-sweep && npm run check:release-artifact-evidence',
    'This import intentionally does not invent DATABASE_URL, RABBITMQ_URL, live provider tokens or real feedback paths.',
    'For full external beta validation, supply real staging DB/RabbitMQ secret-boundary env and live/feedback evidence separately.',
  ],
});
chmodSync(envFilePath, 0o600);

console.log(`EXTERNAL_BETA_EVIDENCE_ENV_PATH=${envFilePath}`);
console.log('Docker backend staging evidence bundle import OK');

function assertBundleEnvelope(document) {
  const violations = [];
  if (document.schemaVersion !== 1) {
    violations.push('schemaVersion must be 1');
  }
  if (document.format !== 'docker-backend-staging-evidence-bundle-v1') {
    violations.push('format must be docker-backend-staging-evidence-bundle-v1');
  }
  if (document.scope !== 'backend-only') {
    violations.push('scope must be backend-only');
  }
  if (document.frontendPolicy !== 'deferred_contract_only') {
    violations.push('frontendPolicy must be deferred_contract_only');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(document.imageDigest ?? ''))) {
    violations.push('imageDigest must be sha256:<64 lowercase hex>');
  }
  if (!/^[0-9a-f]{40}$/.test(String(document.commitSha ?? ''))) {
    violations.push('commitSha must be a full lowercase git SHA');
  }
  if (document.redaction?.secretsIncluded !== false) {
    violations.push('redaction.secretsIncluded must be false');
  }
  if (document.redaction?.databaseUrlsIncluded !== false) {
    violations.push('redaction.databaseUrlsIncluded must be false');
  }
  if (document.redaction?.brokerUrlsIncluded !== false) {
    violations.push('redaction.brokerUrlsIncluded must be false');
  }
  if (!Array.isArray(document.artifacts) || document.artifacts.length === 0) {
    violations.push('artifacts must be non-empty');
  }

  if (violations.length > 0) {
    throw new Error(`Invalid Docker backend staging evidence bundle:\n- ${violations.join('\n- ')}`);
  }
}

function assertRequiredArtifacts(artifacts) {
  const required = new Map([
    ['durable-runtime-selector', 'durable-runtime-selector-artifact-v1'],
    ['rabbitmq-staging-drill-output', 'staging-reliability-artifact-v1'],
    ['postgres-restore-drill-output', 'staging-reliability-artifact-v1'],
    ['durable-backend-e2e-output', 'staging-reliability-artifact-v1'],
    ['source-credential-rotation', 'source-credential-rotation-redacted-v1'],
    ['webhook-secret-rotation', 'webhook-secret-rotation-redacted-v1'],
    ['security-final-sweep', 'security-final-sweep-staging-artifact-v1'],
    ['release-deploy-smoke', 'release-deploy-smoke-artifact-v1'],
  ]);

  const violations = [];
  for (const [artifactId, expectedFormat] of required) {
    const artifact = artifacts.get(artifactId);
    if (artifact === undefined) {
      violations.push(`missing artifact ${artifactId}`);
      continue;
    }
    if (artifact.format !== expectedFormat) {
      violations.push(`${artifactId} format must be ${expectedFormat}`);
    }
    assertPrivateFile(artifact.path, `${artifactId}.path`, violations);
  }

  if (violations.length > 0) {
    throw new Error(`Invalid Docker backend staging evidence artifacts:\n- ${violations.join('\n- ')}`);
  }
}

function artifactPathFor(artifacts, artifactId) {
  const artifact = artifacts.get(artifactId);
  if (artifact === undefined || typeof artifact.path !== 'string' || artifact.path.trim().length === 0) {
    throw new Error(`Docker bundle is missing artifact path for ${artifactId}`);
  }

  return artifact.path;
}

function readArtifact(path, label) {
  return JSON.parse(readPrivateEvidenceJsonFile(path, label));
}

function securityExportPaths(artifact) {
  const pathsByEnv = new Map();
  for (const sourceExport of artifact.sourceExports ?? []) {
    if (typeof sourceExport.envVar === 'string' && typeof sourceExport.path === 'string') {
      pathsByEnv.set(sourceExport.envVar, sourceExport.path);
    }
  }

  const violations = [];
  for (const envVar of ['LOG_EXPORT_PATH', 'METRICS_EXPORT_PATH', 'PUBLIC_ERROR_EXPORT_PATH']) {
    const path = pathsByEnv.get(envVar);
    if (typeof path !== 'string' || path.length === 0) {
      violations.push(`security-final-sweep sourceExports must include ${envVar}`);
      continue;
    }
    assertPrivateFile(path, envVar, violations);
  }

  if (violations.length > 0) {
    throw new Error(`Invalid security final sweep source exports:\n- ${violations.join('\n- ')}`);
  }

  return pathsByEnv;
}

function assertPrivateFile(path, label, violations) {
  if (typeof path !== 'string' || path.trim().length === 0) {
    violations.push(`${label} must be a non-empty path`);
    return;
  }
  let stats;
  try {
    stats = statSync(path);
  } catch {
    violations.push(`${label} must point to an existing file`);
    return;
  }
  if (!stats.isFile()) {
    violations.push(`${label} must point to a regular file`);
  }
  if ((stats.mode & 0o077) !== 0) {
    violations.push(`${label} must use 0600-style private file permissions`);
  }
}
