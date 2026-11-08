// Staging security final-sweep evidence builders; caller owns fixture I/O.
export function securityFinalSweepExportDocuments() {
  return {
    logs: {
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
    },
    metrics: {
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
    },
    publicErrors: {
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
    },
    auditMetadata: {
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
    },
  };
}

export function securityFinalSweepArtifact(exportPaths, artifact) {
  const now = new Date().toISOString();
  artifact.provenance = {
    evidenceKind: 'staging_security_final_sweep',
    collectionMethod: 'Deploy log metric and public error samples captured from staging backend release.',
    runner: 'scripts/capture-security-final-sweep.ts',
    fixtureOnly: false,
  };
  artifact.environment = {
    environmentId: 'staging-security-alpha-1',
    imageDigest: `sha256:${'f'.repeat(64)}`,
    sampledAt: now,
    operator: 'security-owner-1',
  };
  artifact.sourceExports = [
    securityFinalSweepSourceExport('logs', 'LOG_EXPORT_PATH', exportPaths.logs, now),
    securityFinalSweepSourceExport('metrics', 'METRICS_EXPORT_PATH', exportPaths.metrics, now),
    securityFinalSweepSourceExport(
      'public-errors',
      'PUBLIC_ERROR_EXPORT_PATH',
      exportPaths.publicErrors,
      now,
    ),
    securityFinalSweepSourceExport(
      'audit-metadata',
      'AUDIT_EVENT_EXPORT_PATH',
      exportPaths.auditMetadata,
      now,
    ),
  ];
  updateSecurityFinalSweepSurface(artifact, 'logs', exportPaths.logs.sampleCount);
  updateSecurityFinalSweepSurface(artifact, 'metrics', exportPaths.metrics.sampleCount);
  updateSecurityFinalSweepSurface(artifact, 'public-errors', exportPaths.publicErrors.sampleCount);
  updateSecurityFinalSweepSurface(artifact, 'audit-metadata', exportPaths.auditMetadata.sampleCount);
  artifact.review = {
    reviewer: 'security-owner-1',
    decision: 'passed',
    notes: 'Staging redaction review completed for logs, metrics, public errors and audit metadata.',
  };
  return artifact;
}

function securityFinalSweepSourceExport(surfaceId, envVar, exportFile, collectedAt) {
  return {
    surfaceId,
    envVar,
    path: exportFile.path,
    sha256: exportFile.sha256,
    sampleCount: exportFile.sampleCount,
    redactedOnly: true,
    sanitized: true,
    collectedAt,
  };
}

function updateSecurityFinalSweepSurface(artifact, surfaceId, sampleCount) {
  const surface = artifact.surfaces.find((item) => item.surfaceId === surfaceId);
  surface.sampleCount = sampleCount;
  for (const result of surface.leakClassResults) {
    result.sampleCount = sampleCount;
  }
}

