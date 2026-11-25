/** Build the deterministic artifact files used by the Docker staging bundle self-test. */
export function syntheticArtifact(artifactId, definition, observedAt) {
  const base = {
    schemaVersion: 1,
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    provenance: {
      evidenceKind: 'docker_self_test',
      collectionMethod: 'Synthetic self-test artifact for bundle validator.',
      runner: 'scripts/check-docker-backend-staging-evidence-bundle.mjs',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false,
      brokerUrlsIncluded: false,
    },
  };
  if (artifactId === 'durable-runtime-selector') {
    return {
      ...base,
      artifactFormat: definition.format,
      environment: {
        environmentId: 'docker-self-test',
        imageDigest: `sha256:${'1'.repeat(64)}`,
        apiBaseUrl: 'http://127.0.0.1:3100',
        sampledAt: observedAt,
        operator: 'backend-ops-self-test',
      },
      services: ['api-gateway', 'ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay'].map((serviceId) => ({
        serviceId,
        runtimeProfile: 'beta',
        forbiddenSelectorValuesFound: [],
      })),
      rollup: {
        allServicesDurable: true,
        forbiddenSelectorsFound: false,
        runtimeProfile: 'beta',
      },
    };
  }
  if (artifactId === 'source-credential-rotation' || artifactId === 'webhook-secret-rotation') {
    return {
      ...base,
      artifactFormat: definition.format,
      operations: [
        {
          operationId: `${artifactId}-self-test`,
          status: 'passed',
          observedAt,
        },
      ],
    };
  }
  if (artifactId === 'security-final-sweep') {
    return {
      ...base,
      artifactFormat: definition.format,
      surfaces: ['logs', 'metrics', 'public-errors', 'audit-metadata'].map((surfaceId) => ({
        surfaceId,
        sampleCount: 1,
        scanStatus: 'passed',
        redactedOnly: true,
      })),
      sourceExports: ['logs', 'metrics', 'public-errors'].map((surfaceId) => ({
        surfaceId,
        path: `/tmp/${surfaceId}.json`,
        redactedOnly: true,
        sanitized: true,
      })),
    };
  }
  if (artifactId === 'release-deploy-smoke') {
    return {
      ...base,
      format: definition.format,
      artifactId,
      smokeResults: ['api-health', 'openapi-contract', 'migration-version', 'worker-pause-resume'].map((smokeId) => ({
        smokeId,
        status: 'passed',
        observedAt,
      })),
    };
  }
  return {
    ...base,
    format: definition.format,
    artifactId,
    signalResults: [
      {
        signalId: `${artifactId}-self-test`,
        status: 'passed',
        observedAt,
        evidence: {
          summary: 'redacted self-test evidence',
        },
      },
    ],
  };
}
