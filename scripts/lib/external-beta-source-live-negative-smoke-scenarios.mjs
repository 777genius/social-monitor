// Pure negative-smoke scenario declarations; execution, files and cleanup stay with the caller.
export function sourceLiveNegativeSmokeScenarios() {
  const wrongImageDigest = `sha256:${'c'.repeat(64)}`;
  const scenarios = [
    {
      label: 'fixture provenance',
      expectedOutput: 'fixture provenance',
      artifactPatch: {
        fixtureOnly: true,
        source: {
          evidenceKind: 'fixture_example',
        },
      },
    },
    {
      label: 'unredacted sensitive key',
      expectedOutput: 'unredacted sensitive key',
      artifactPatch: {
        diagnostics: {
          password: 'not-redacted-secret-value',
        },
      },
    },
    {
      label: 'raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (base) => {
        const artifact = {
          ...base,
          diagnostics: {
            authorization: 'redacted',
          },
        };
        return `${JSON.stringify(artifact, null, 2)}\n`.replace(
          '"authorization": "redacted"',
          [
            '"authorization": "',
            ['Bearer', ' raw-live-token-hidden-by-duplicate-key'].join(''),
            '",\n    "authorization": "redacted"',
          ].join(''),
        );
      },
    },
    {
      label: 'wrong artifact id',
      expectedOutput: 'must use artifactId live-open-connectors-evidence-v1',
      artifactPatch: {
        artifactId: 'wrong-live-open-connectors-evidence',
      },
    },
    {
      label: 'missing provider key',
      expectedOutput: 'must include providerKey github-issues',
      artifact: (base) => ({
        ...base,
        providerResults: base.providerResults.filter((result) => result.providerKey !== 'github-issues'),
      }),
    },
    {
      label: 'unexpected provider key',
      expectedOutput: 'must not include providerKey mastodon',
      artifact: (base) => ({
        ...base,
        providerResults: [
          ...base.providerResults,
          {
            providerKey: 'mastodon',
            status: 'passed',
            sampledAt: base.sampledAt,
          },
        ],
      }),
    },
    {
      label: 'stale artifact timestamp',
      expectedOutput: 'older than',
      artifact: (base) => ({
        ...base,
        sampledAt: '2000-01-01T00:00:00.000Z',
        environment: {
          ...base.environment,
          sampledAt: '2000-01-01T00:00:00.000Z',
        },
        providerResults: base.providerResults.map((result) => ({
          ...result,
          sampledAt: '2000-01-01T00:00:00.000Z',
        })),
      }),
    },
    {
      label: 'future artifact timestamp',
      expectedOutput: 'must not be in the future',
      artifact: (base) => {
        const futureTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        return {
          ...base,
          sampledAt: futureTimestamp,
          environment: {
            ...base.environment,
            sampledAt: futureTimestamp,
          },
          providerResults: base.providerResults.map((result) => ({
            ...result,
            sampledAt: futureTimestamp,
          })),
        };
      },
    },
    {
      label: 'environment image digest mismatch',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      artifact: (base) => ({
        ...base,
        environment: {
          ...base.environment,
          imageDigest: wrongImageDigest,
        },
      }),
    },
    {
      label: 'environment commit sha mismatch',
      expectedOutput: 'commitSha must match BACKEND_GIT_COMMIT_SHA',
      artifact: (base) => ({
        ...base,
        environment: {
          ...base.environment,
          commitSha: '0'.repeat(40),
        },
      }),
    },
    {
      label: 'nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      artifact: (base) => {
        const artifact = JSON.parse(JSON.stringify(base));
        artifact.providerResults[0].signalResults[0].evidence.sampleId = 'live-open-example-001';
        return artifact;
      },
    },
    {
      label: 'world-readable evidence artifact',
      expectedOutput: '0600-style private file permissions',
      fileMode: 0o644,
      artifact: (base) => base,
    },
  ];
  return scenarios;
}
