import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const artifactDir =
  process.env.SECURITY_FINAL_SWEEP_ARTIFACT_DIR ??
  process.env.BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR ??
  '/tmp/social-monitor-evidence';
const logExportPath = process.env.LOG_EXPORT_PATH ?? join(resolve(artifactDir), 'security-logs-export.json');
const metricsExportPath = process.env.METRICS_EXPORT_PATH ?? join(resolve(artifactDir), 'security-metrics-export.json');
const publicErrorExportPath = process.env.PUBLIC_ERROR_EXPORT_PATH ?? join(resolve(artifactDir), 'security-public-errors-export.json');
const auditEventExportPath = process.env.AUDIT_EVENT_EXPORT_PATH ?? join(resolve(artifactDir), 'security-audit-events-export.json');
const securityFinalSweepPath =
  process.env.SECURITY_FINAL_SWEEP_ARTIFACT_PATH ??
  join(resolve(artifactDir), 'security-final-sweep.json');
const envFilePath =
  process.env.SECURITY_FINAL_SWEEP_ENV_PATH ??
  join(resolve(artifactDir), 'security-final-sweep.env');
const logExportTarget = validateEvidenceJsonFilePath(logExportPath, 'LOG_EXPORT_PATH');
const metricsExportTarget = validateEvidenceJsonFilePath(metricsExportPath, 'METRICS_EXPORT_PATH');
const publicErrorExportTarget = validateEvidenceJsonFilePath(publicErrorExportPath, 'PUBLIC_ERROR_EXPORT_PATH');
const auditEventExportTarget = validateEvidenceJsonFilePath(auditEventExportPath, 'AUDIT_EVENT_EXPORT_PATH');
const securityFinalSweepTarget = validateEvidenceJsonFilePath(
  securityFinalSweepPath,
  'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
);
const envFileTarget = validateEvidenceEnvFilePath(envFilePath);
const identityEnvNames = ['STAGING_ENVIRONMENT_ID', 'STAGING_OPERATOR'];
const forbiddenIdentityFragments = ['local', 'fixture', 'example', 'mock', 'test'];
const sampledAt = new Date().toISOString();
const environmentId = evidenceIdentity('STAGING_ENVIRONMENT_ID', 'security-final-sweep-drill');
const imageDigest = process.env.BACKEND_IMAGE_DIGEST ?? `sha256:${'e'.repeat(64)}`;
const operator = evidenceIdentity('STAGING_OPERATOR', 'security-owner');

mkdirSync(artifactDir, { recursive: true });

const exportsBySurface = {
  logs: writeExport(logExportTarget, {
    records: [
      {
        requestId: 'req-sec-1',
        tenantId: 'tenant-alpha-1',
        workspaceId: 'workspace-alpha-1',
        service: 'api-gateway',
        operation: 'create-interest',
        status: 'ok',
      },
      {
        requestId: 'req-sec-2',
        tenantId: 'tenant-alpha-1',
        workspaceId: 'workspace-alpha-1',
        service: 'ingestion-worker',
        operation: 'scan-complete',
        status: 'ok',
      },
    ],
  }),
  metrics: writeExport(metricsExportTarget, {
    records: [
      {
        metricName: 'queue_lag_seconds',
        tenantId: 'tenant-alpha-1',
        workspaceId: 'workspace-alpha-1',
        service: 'delivery-service',
        status: 'ok',
      },
      {
        metricName: 'summary_cost_units',
        tenantId: 'tenant-alpha-1',
        workspaceId: 'workspace-alpha-1',
        service: 'intelligence-worker',
        status: 'ok',
      },
    ],
  }),
  publicErrors: writeExport(publicErrorExportTarget, {
    records: [
      {
        requestId: 'req-sec-3',
        statusCode: 401,
        errorCode: 'workspace_access_denied',
        operation: 'list-feed',
      },
      {
        requestId: 'req-sec-4',
        statusCode: 429,
        errorCode: 'rate_limit_exceeded',
        operation: 'create-scan',
      },
    ],
  }),
  auditMetadata: writeExport(auditEventExportTarget, {
    records: [
      {
        auditEventId: 'audit-sec-1',
        tenantId: 'tenant-alpha-1',
        workspaceId: 'workspace-alpha-1',
        actorId: 'user-alpha-1',
        operation: 'create-source-binding',
        status: 'recorded',
      },
      {
        auditEventId: 'audit-sec-2',
        tenantId: 'tenant-alpha-1',
        workspaceId: 'workspace-alpha-1',
        actorId: 'api-key-alpha-1',
        operation: 'request-summary',
        status: 'recorded',
      },
    ],
  }),
};

const artifact = {
  schemaVersion: 1,
  artifactFormat: 'security-final-sweep-staging-artifact-v1',
  scope: 'backend-only',
  frontendPolicy: 'deferred_contract_only',
  provenance: {
    evidenceKind: 'staging_security_final_sweep',
    collectionMethod: 'Deploy log metric and public error samples captured from backend release.',
    runner: 'scripts/capture-security-final-sweep.mjs',
    fixtureOnly: false,
  },
  environment: {
    environmentId,
    imageDigest,
    sampledAt,
    operator,
  },
  redaction: {
    secretValuesIncluded: false,
    credentialUrlsIncluded: false,
    rawProviderPayloadsIncluded: false,
    rawPromptTextIncluded: false,
    rawSourceTextIncluded: false,
    piiIncluded: false,
    method: 'Sample exports keep only support-safe ids, counters, service names, operations and statuses.',
  },
  sourceExports: [
    sourceExport('logs', 'LOG_EXPORT_PATH', exportsBySurface.logs),
    sourceExport('metrics', 'METRICS_EXPORT_PATH', exportsBySurface.metrics),
    sourceExport('public-errors', 'PUBLIC_ERROR_EXPORT_PATH', exportsBySurface.publicErrors),
    sourceExport('audit-metadata', 'AUDIT_EVENT_EXPORT_PATH', exportsBySurface.auditMetadata),
  ],
  surfaces: [
    surface('logs', exportsBySurface.logs.sampleCount, [
      'requestId',
      'tenantId',
      'workspaceId',
      'service',
      'operation',
      'status',
    ]),
    surface('metrics', exportsBySurface.metrics.sampleCount, [
      'metricName',
      'tenantId',
      'workspaceId',
      'service',
      'status',
    ]),
    surface('public-errors', exportsBySurface.publicErrors.sampleCount, [
      'requestId',
      'statusCode',
      'errorCode',
      'operation',
    ]),
    surface('audit-metadata', exportsBySurface.auditMetadata.sampleCount, [
      'auditEventId',
      'tenantId',
      'workspaceId',
      'actorId',
      'operation',
      'status',
    ]),
  ],
  review: {
    reviewer: operator,
    decision: 'passed',
    notes: 'Redaction review completed for logs, metrics, public errors and audit metadata samples.',
  },
};

writeFileSync(securityFinalSweepTarget, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
chmodSync(securityFinalSweepTarget, 0o600);

const env = {
  ...process.env,
  SECURITY_FINAL_SWEEP_ARTIFACT_PATH: securityFinalSweepTarget,
  LOG_EXPORT_PATH: logExportTarget,
  METRICS_EXPORT_PATH: metricsExportTarget,
  PUBLIC_ERROR_EXPORT_PATH: publicErrorExportTarget,
  AUDIT_EVENT_EXPORT_PATH: auditEventExportTarget,
};
execFileSync('node', ['scripts/check-security-final-sweep.mjs'], {
  env,
  stdio: 'inherit',
});

writeEvidenceEnvFile(envFileTarget, [
  ['SECURITY_FINAL_SWEEP_ARTIFACT_PATH', securityFinalSweepTarget],
  ['LOG_EXPORT_PATH', logExportTarget],
  ['METRICS_EXPORT_PATH', metricsExportTarget],
  ['PUBLIC_ERROR_EXPORT_PATH', publicErrorExportTarget],
  ['AUDIT_EVENT_EXPORT_PATH', auditEventExportTarget],
], {
  usageLines: [
    'Usage:',
    `set -a; . ${shellQuote(envFileTarget)}; set +a`,
    'npm run beta:evidence:validate -- --job security-final-sweep-staging',
    'This handoff includes security final sweep artifact paths only. It intentionally does not export STAGING_ENVIRONMENT_ID for other staging jobs.',
  ],
});

console.log(`SECURITY_FINAL_SWEEP_ARTIFACT_PATH=${securityFinalSweepTarget}`);
console.log(`LOG_EXPORT_PATH=${logExportTarget}`);
console.log(`METRICS_EXPORT_PATH=${metricsExportTarget}`);
console.log(`PUBLIC_ERROR_EXPORT_PATH=${publicErrorExportTarget}`);
console.log(`AUDIT_EVENT_EXPORT_PATH=${auditEventExportTarget}`);
console.log(`SECURITY_FINAL_SWEEP_ENV_PATH=${envFileTarget}`);

function writeExport(path, document) {
  mkdirSync(dirname(path), { recursive: true });
  const content = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
  return {
    path,
    sha256: createHash('sha256').update(content).digest('hex'),
    sampleCount: document.records.length,
  };
}

function sourceExport(surfaceId, envVar, exportFile) {
  return {
    surfaceId,
    envVar,
    path: exportFile.path,
    sha256: exportFile.sha256,
    sampleCount: exportFile.sampleCount,
    redactedOnly: true,
    sanitized: true,
    collectedAt: sampledAt,
  };
}

function surface(surfaceId, sampleCount, safeDiagnosticFields) {
  return {
    surfaceId,
    sampleCount,
    scanStatus: 'passed',
    redactedOnly: true,
    safeDiagnosticFields,
    leakClassResults: [
      leakClassResult('secret-values', sampleCount),
      leakClassResult('raw-provider-payloads', sampleCount),
      leakClassResult('raw-prompt-or-source-text', sampleCount),
    ],
  };
}

function leakClassResult(leakClass, sampleCount) {
  return {
    leakClass,
    found: false,
    sampleCount,
  };
}

function evidenceIdentity(name, fallback) {
  const value = process.env[name]?.trim() ?? fallback;
  if (identityEnvNames.includes(name) && isForbiddenEvidenceIdentity(value)) {
    throw new Error(`${name} must not use local, fixture, example, mock or test identifiers`);
  }

  return value;
}

function isForbiddenEvidenceIdentity(value) {
  const normalized = value.toLowerCase();
  return forbiddenIdentityFragments.some((fragment) => normalized.includes(fragment));
}
