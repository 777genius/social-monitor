/**
 * Build a deterministic security-sweep artifact for the local direct-path guard tests.
 * The verifier supplies contract values; this fixture builder performs no I/O.
 */
export function buildDirectSecurityArtifact({ exportPathsByEnv, exportHashesByEnv }, {
  securityFinalSweepArtifactFormat,
  securityFinalSweepEvidenceKind,
  requiredLeakClasses,
}) {
  const sampledAt = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const sourceExports = [
    directSourceExport('logs', 'LOG_EXPORT_PATH', exportPathsByEnv.LOG_EXPORT_PATH, exportHashesByEnv.LOG_EXPORT_PATH, sampledAt),
    directSourceExport('metrics', 'METRICS_EXPORT_PATH', exportPathsByEnv.METRICS_EXPORT_PATH, exportHashesByEnv.METRICS_EXPORT_PATH, sampledAt),
    directSourceExport(
      'public-errors',
      'PUBLIC_ERROR_EXPORT_PATH',
      exportPathsByEnv.PUBLIC_ERROR_EXPORT_PATH,
      exportHashesByEnv.PUBLIC_ERROR_EXPORT_PATH,
      sampledAt,
    ),
    directSourceExport(
      'audit-metadata',
      'AUDIT_EVENT_EXPORT_PATH',
      exportPathsByEnv.AUDIT_EVENT_EXPORT_PATH,
      exportHashesByEnv.AUDIT_EVENT_EXPORT_PATH,
      sampledAt,
    ),
  ];

  return {
    schemaVersion: 1,
    artifactFormat: securityFinalSweepArtifactFormat,
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    provenance: {
      evidenceKind: securityFinalSweepEvidenceKind,
      collectionMethod: 'staging security sweep capture',
      runner: 'scripts/capture-security-final-sweep.mjs',
      fixtureOnly: false,
    },
    environment: {
      environmentId: 'staging-alpha-1',
      imageDigest: `sha256:${'e'.repeat(64)}`,
      sampledAt,
      operator: 'security-owner-1',
    },
    redaction: {
      secretValuesIncluded: false,
      credentialUrlsIncluded: false,
      rawProviderPayloadsIncluded: false,
      rawPromptTextIncluded: false,
      rawSourceTextIncluded: false,
      piiIncluded: false,
      method: 'Sanitized staging security sweep artifacts with redacted diagnostic fields.',
    },
    sourceExports,
    surfaces: [
      directSurface('logs', requiredLeakClasses),
      directSurface('metrics', requiredLeakClasses),
      directSurface('public-errors', requiredLeakClasses),
      directSurface('audit-metadata', requiredLeakClasses),
    ],
    review: {
      reviewer: 'security-owner-1',
      decision: 'passed',
      notes: 'Security final sweep review completed for sanitized staging evidence.',
    },
  };
}

/** Describe one captured source export in the deterministic fixture. */
function directSourceExport(surfaceId, envVar, path, sha256, collectedAt) {
  return {
    surfaceId,
    envVar,
    path,
    sha256,
    sampleCount: 1,
    redactedOnly: true,
    sanitized: true,
    collectedAt,
  };
}

/** Preserve the direct fixture's per-surface leak-class records in input order. */
function directSurface(surfaceId, requiredLeakClasses) {
  return {
    surfaceId,
    sampleCount: 1,
    scanStatus: 'passed',
    redactedOnly: true,
    safeDiagnosticFields: ['requestId', 'tenantId', 'workspaceId', 'status'],
    leakClassResults: [...requiredLeakClasses].map((leakClass) => ({
      leakClass,
      found: false,
      sampleCount: 1,
    })),
  };
}
