// Synthetic staging evidence artifact builders; no file or network access.
// Caller loads the tracked fixture and passes it at the same original invocation point.
export function stagingReliabilityArtifact(config, fixture) {
  const example = fixture.examples.find((item) => item.artifactId === config.artifactId);
  if (example === undefined) {
    throw new Error(`Missing staging reliability fixture for ${config.artifactId}`);
  }

  const artifact = sanitizeStagingReliabilityArtifactStrings(JSON.parse(JSON.stringify(example)));
  const now = Date.now();
  const startedAtMs = now - 10 * 60 * 1000;
  const completedAtMs = now - 60 * 1000;
  const startedAt = new Date(startedAtMs).toISOString();
  const completedAt = new Date(completedAtMs).toISOString();

  artifact.environmentId = 'staging-alpha-1';
  artifact.imageDigest = config.imageDigest;
  artifact.operator = config.operator;
  artifact.startedAt = startedAt;
  artifact.completedAt = completedAt;
  artifact.provenance = {
    evidenceKind: 'staging_drill',
    collectionMethod: `${config.collectionLabel} captured from beta backend environment.`,
    runner: config.runner,
    fixtureOnly: false,
  };
  if (config.apiBaseUrl !== undefined) {
    artifact.apiBaseUrl = config.apiBaseUrl;
  } else {
    delete artifact.apiBaseUrl;
  }

  const signalStepMs = Math.floor((completedAtMs - startedAtMs) / (artifact.signalResults.length + 1));
  artifact.signalResults = artifact.signalResults.map((result, index) => {
    const observedAt = new Date(startedAtMs + signalStepMs * (index + 1)).toISOString();
    const refreshed = {
      ...result,
      observedAt,
    };
    refreshStagingReliabilityEvidenceTimestamps(refreshed.evidence, observedAt);
    if (refreshed.signalId === 'backend-loop-scheduled-scan' && refreshed.evidence?.scheduledScan !== undefined) {
      refreshed.evidence.scheduledScan.completedAt = observedAt;
      refreshed.evidence.scheduledScan.nextRunAtAfterSchedule = new Date(Date.parse(observedAt) + 60 * 1000).toISOString();
    }
    return refreshed;
  });

  return artifact;
}

function sanitizeStagingReliabilityArtifactStrings(value) {
  if (typeof value === 'string') {
    return value
      .replaceAll('Synthetic', 'Captured')
      .replaceAll('synthetic', 'captured')
      .replaceAll('fixture', 'capture')
      .replaceAll('Fixture', 'Capture')
      .replaceAll('example', 'alpha')
      .replaceAll('Example', 'Alpha');
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStagingReliabilityArtifactStrings(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeStagingReliabilityArtifactStrings(item)]),
    );
  }
  return value;
}

function refreshStagingReliabilityEvidenceTimestamps(value, observedAt) {
  if (Array.isArray(value)) {
    for (const item of value) {
      refreshStagingReliabilityEvidenceTimestamps(item, observedAt);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith('At') && typeof item === 'string') {
      value[key] = observedAt;
    } else {
      refreshStagingReliabilityEvidenceTimestamps(item, observedAt);
    }
  }
}

export function stagingReliabilitySmokeConfigByArtifactId(artifactId) {
  const config = stagingReliabilitySmokeConfigs().find((item) => item.artifactId === artifactId);
  if (config === undefined) {
    throw new Error(`Missing staging reliability smoke config for ${artifactId}`);
  }
  return config;
}

export function stagingReliabilitySmokeConfigs() {
  return [
    {
      artifactId: 'rabbitmq-staging-drill-output',
      collectionLabel: 'RabbitMQ reliability drill',
      envName: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
      imageDigest: `sha256:${'1'.repeat(64)}`,
      jobId: 'rabbitmq-staging-reliability-drill',
      operator: 'ops-owner-1',
      runner: 'scripts/capture-rabbitmq-reliability-drill.ts',
      requiredEnv: {
        RABBITMQ_URL: 'amqps://release:...@rabbitmq.staging.social-monitor.invalid:5671',
      },
    },
    {
      artifactId: 'postgres-restore-drill-output',
      collectionLabel: 'Postgres restore and migration drill',
      envName: 'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
      imageDigest: `sha256:${'2'.repeat(64)}`,
      jobId: 'postgres-restore-migration-drill',
      operator: 'ops-owner-1',
      runner: 'scripts/capture-postgres-restore-drill.ts',
      requiredEnv: {
        DATABASE_URL: 'postgresql://release:...@db.staging.social-monitor.invalid:5432/social_monitor',
      },
    },
    {
      apiBaseUrl: 'https://api.staging.social-monitor.invalid',
      artifactId: 'durable-backend-e2e-output',
      collectionLabel: 'Durable backend E2E loop',
      envName: 'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
      imageDigest: `sha256:${'3'.repeat(64)}`,
      jobId: 'durable-backend-e2e-loop',
      operator: 'backend-lead-1',
      runner: 'scripts/capture-durable-backend-e2e-loop.ts',
      requiredEnv: {
        API_BASE_URL: 'https://api.staging.social-monitor.invalid',
        INFINITY_CONTEXT_TOKEN: 'secret-ref:infinity-context-token',
        INFINITY_CONTEXT_URL: 'https://memory.staging.social-monitor.invalid',
      },
    },
  ];
}
