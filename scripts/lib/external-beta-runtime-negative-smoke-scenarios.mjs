// Pure scenario declarations; caller owns all file writes, runner I/O, and cleanup.
export function durableRuntimeNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'durable runtime fixture provenance',
      expectedOutput: 'fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for durable runtime selector schema validation.',
          runner: 'ops/release/fixtures/durable-runtime-selector-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'durable runtime in-memory selector',
      expectedOutput: 'must not be in-memory',
      mutateArtifact: (artifact) => {
        const service = artifact.services.find((item) => item.serviceId === 'api-gateway');
        service.serviceSelectors.MONITORING_PERSISTENCE = 'in-memory';
      },
    },
    {
      label: 'durable runtime missing event relay',
      expectedOutput: 'services must include event-relay',
      mutateArtifact: (artifact) => {
        artifact.services = artifact.services.filter((service) => service.serviceId !== 'event-relay');
      },
    },
    {
      label: 'durable runtime forbidden rollup',
      expectedOutput: 'rollup.forbiddenSelectorsFound must be false',
      mutateArtifact: (artifact) => {
        artifact.rollup.forbiddenSelectorsFound = true;
      },
    },
    {
      label: 'durable runtime image digest mismatch',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      mutateArtifact: (artifact) => {
        artifact.environment.imageDigest = `sha256:${'e'.repeat(64)}`;
      },
    },
    {
      label: 'durable runtime nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.services[0].healthCheck.probeId = 'runtime-selector-example-001';
      },
    },
    {
      label: 'durable runtime raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"operator": "release-operator-1"',
        [
          '"operator": "',
          ['Bearer', ' raw-runtime-token-hidden-by-duplicate-key'].join(''),
          '",\n    "operator": "release-operator-1"',
        ].join(''),
      ),
    },
  ];
  return scenarios;
}

export function stagingReliabilityNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'staging reliability fixture provenance',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for RabbitMQ staging drill schema validation.',
          runner: 'ops/drills/fixtures/staging-reliability-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'staging reliability wrong artifact id',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'must use artifactId rabbitmq-staging-drill-output',
      mutateArtifact: (artifact) => {
        artifact.artifactId = 'wrong-staging-drill-output';
      },
    },
    {
      label: 'staging reliability image digest mismatch',
      artifactId: 'postgres-restore-drill-output',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      mutateArtifact: (artifact) => {
        artifact.imageDigest = `sha256:${'9'.repeat(64)}`;
      },
    },
    {
      label: 'staging reliability missing postgres signal',
      artifactId: 'postgres-restore-drill-output',
      expectedOutput: 'missing signal result "postgres-no-duplicate-side-effects"',
      mutateArtifact: (artifact) => {
        artifact.signalResults = artifact.signalResults.filter(
          (result) => result.signalId !== 'postgres-no-duplicate-side-effects',
        );
      },
    },
    {
      label: 'staging reliability failed durable signal',
      artifactId: 'durable-backend-e2e-output',
      expectedOutput: 'signal result "backend-loop-idempotency" must have status=passed',
      mutateArtifact: (artifact) => {
        const result = artifact.signalResults.find(
          (item) => item.signalId === 'backend-loop-idempotency',
        );
        result.status = 'failed';
      },
    },
    {
      label: 'staging reliability durable API mismatch',
      artifactId: 'durable-backend-e2e-output',
      expectedOutput: 'apiBaseUrl must match API_BASE_URL',
      mutateArtifact: (artifact) => {
        artifact.apiBaseUrl = 'https://api.other-staging.social-monitor.invalid';
      },
    },
    {
      label: 'staging reliability nested fixture marker',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.signalResults[0].evidence.messageId = 'msg-rabbitmq-confirm-example';
      },
    },
    {
      label: 'staging reliability raw duplicate-key credential hidden by JSON parser',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"summary": "redacted publisher confirm ack observed"',
        [
          '"summary": "',
          ['Bearer', ' raw-staging-token-hidden-by-duplicate-key'].join(''),
          '",\n            "summary": "redacted publisher confirm ack observed"',
        ].join(''),
      ),
    },
  ];
  return scenarios;
}
