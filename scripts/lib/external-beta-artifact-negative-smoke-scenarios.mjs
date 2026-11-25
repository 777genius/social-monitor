/** Pure original negative artifact smoke case factories; runner retains I/O and assertions. */
export function releaseDeployNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'release deploy fixture provenance',
      expectedOutput: 'must not contain fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for release deploy smoke schema validation.',
          runner: 'ops/release/fixtures/release-deploy-smoke-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'release deploy image digest mismatch',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      mutateArtifact: (artifact) => {
        artifact.imageDigest = `sha256:${'9'.repeat(64)}`;
      },
    },
    {
      label: 'release deploy commit mismatch',
      expectedOutput: 'commitSha must match current release commit',
      mutateArtifact: (artifact) => {
        artifact.commitSha = '0'.repeat(40);
      },
    },
    {
      label: 'release deploy artifact digest mismatch',
      expectedOutput: 'artifact digest "openapi-snapshot" value must match release evidence',
      mutateArtifact: (artifact) => {
        const digest = artifact.artifactDigests.find((item) => item.artifactId === 'openapi-snapshot');
        digest.value = '0'.repeat(64);
      },
    },
    {
      label: 'release deploy missing smoke result',
      expectedOutput: 'missing smokeResult "worker-pause-resume"',
      mutateArtifact: (artifact) => {
        artifact.smokeResults = artifact.smokeResults.filter(
          (result) => result.smokeId !== 'worker-pause-resume',
        );
      },
    },
    {
      label: 'release deploy raw headers redaction flag',
      expectedOutput: 'redaction.rawHeadersIncluded must be false',
      mutateArtifact: (artifact) => {
        artifact.redaction.rawHeadersIncluded = true;
      },
    },
    {
      label: 'release deploy nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.smokeResults[0].evidence.sampleId = 'release-deploy-example-001';
      },
    },
  ];
  return scenarios;
}

export function redditArtifactNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'reddit lifecycle hash mismatch',
      expectedOutput: 'sha256 must match reddit live evidence lifecycle signal',
      lifecycleArtifactSha256: '0'.repeat(64),
    },
    {
      label: 'reddit lifecycle unredacted sensitive key',
      expectedOutput: 'unredacted sensitive key',
      mutateLifecycle: (artifact) => {
        artifact.diagnostics = {
          password: 'not-redacted-secret-value',
        };
      },
    },
    {
      label: 'reddit lifecycle missing redacted preview',
      expectedOutput: 'lifecycleOperations must include redacted-preview',
      mutateLifecycle: (artifact) => {
        artifact.lifecycleOperations = artifact.lifecycleOperations.filter(
          (operation) => operation.operation !== 'redacted-preview',
        );
      },
    },
    {
      label: 'reddit lifecycle non ISO observedAt',
      expectedOutput: 'lifecycleOperations[0].observedAt must be an ISO timestamp',
      mutateLifecycle: (artifact) => {
        artifact.lifecycleOperations[0].observedAt = 'not-a-timestamp';
      },
    },
    {
      label: 'reddit live signal non ISO observedAt',
      expectedOutput: 'signalResult "reddit-tenant-oauth-smoke" observedAt must be an ISO timestamp',
      mutateLive: (artifact) => {
        artifact.providerResults[0].signalResults[0].observedAt = 'not-a-timestamp';
      },
    },
    {
      label: 'reddit live evidence missing provider',
      expectedOutput: 'must include providerKey reddit',
      mutateLive: (artifact) => {
        artifact.providerResults = [];
      },
    },
    {
      label: 'reddit live commit sha mismatch',
      expectedOutput: 'commitSha must match BACKEND_GIT_COMMIT_SHA',
      mutateLive: (artifact) => {
        artifact.commitSha = '0'.repeat(40);
      },
    },
    {
      label: 'reddit live nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateLive: (artifact) => {
        artifact.providerResults[0].signalResults[0].evidence.sampleId = 'reddit-live-example-001';
      },
    },
    {
      label: 'reddit lifecycle nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateLifecycle: (artifact) => {
        artifact.lifecycleOperations[0].evidence.sampleId = 'reddit-lifecycle-example-001';
      },
    },
  ];
  return scenarios;
}
