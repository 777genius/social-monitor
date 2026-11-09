import assert from 'node:assert/strict';
import test from 'node:test';
import { redditArtifactNegativeSmokeScenarios, releaseDeployNegativeSmokeScenarios } from './external-beta-artifact-negative-smoke-scenarios.mjs';

const releaseExpected = [
  ['release deploy fixture provenance', 'must not contain fixture provenance'],
  ['release deploy image digest mismatch', 'imageDigest must match BACKEND_IMAGE_DIGEST'],
  ['release deploy commit mismatch', 'commitSha must match current release commit'],
  ['release deploy artifact digest mismatch', 'artifact digest "openapi-snapshot" value must match release evidence'],
  ['release deploy missing smoke result', 'missing smokeResult "worker-pause-resume"'],
  ['release deploy raw headers redaction flag', 'redaction.rawHeadersIncluded must be false'],
  ['release deploy nested fixture marker', 'must not contain fixture marker "example"'],
];
const redditExpected = [
  ['reddit lifecycle hash mismatch', 'sha256 must match reddit live evidence lifecycle signal'],
  ['reddit lifecycle unredacted sensitive key', 'unredacted sensitive key'],
  ['reddit lifecycle missing redacted preview', 'lifecycleOperations must include redacted-preview'],
  ['reddit lifecycle non ISO observedAt', 'lifecycleOperations[0].observedAt must be an ISO timestamp'],
  ['reddit live signal non ISO observedAt', 'signalResult "reddit-tenant-oauth-smoke" observedAt must be an ISO timestamp'],
  ['reddit live evidence missing provider', 'must include providerKey reddit'],
  ['reddit live commit sha mismatch', 'commitSha must match BACKEND_GIT_COMMIT_SHA'],
  ['reddit live nested fixture marker', 'must not contain fixture marker "example"'],
  ['reddit lifecycle nested fixture marker', 'must not contain fixture marker "example"'],
];

function releaseArtifact() {
  return {
    provenance: null,
    imageDigest: 'original',
    commitSha: 'original',
    artifactDigests: [{ artifactId: 'openapi-snapshot', value: 'original' }],
    smokeResults: [
      { smokeId: 'worker-pause-resume', evidence: { sampleId: 'original' } },
      { smokeId: 'other', evidence: { sampleId: 'original' } },
    ],
    redaction: { rawHeadersIncluded: false },
  };
}

function redditPair() {
  return {
    live: {
      commitSha: 'original',
      providerResults: [{ signalResults: [{ observedAt: '2026-01-01T00:00:00Z', evidence: { sampleId: 'original' } }] }],
    },
    lifecycle: {
      diagnostics: {},
      lifecycleOperations: [
        { operation: 'redacted-preview', observedAt: '2026-01-01T00:00:00Z', evidence: { sampleId: 'original' } },
        { operation: 'other', observedAt: '2026-01-01T00:00:00Z', evidence: { sampleId: 'other' } },
      ],
    },
  };
}

test('all seven release negatives preserve original ordered diagnostics', () => {
  const cases = releaseDeployNegativeSmokeScenarios();
  assert.deepEqual(cases.map(({ label, expectedOutput }) => [label, expectedOutput]), releaseExpected);
  assert.equal(new Set(cases.map(x => x.label)).size, 7);
  assert.ok(cases.every(x => typeof x.mutateArtifact === 'function'));
  assert.notStrictEqual(cases, releaseDeployNegativeSmokeScenarios());
});

test('all seven release mutations remain rejectable', () => {
  const values = releaseDeployNegativeSmokeScenarios().map(scenario => {
    const artifact = releaseArtifact();
    scenario.mutateArtifact(artifact);
    return artifact;
  });
  assert.equal(values[0].provenance.evidenceKind, 'fixture_example');
  assert.equal(values[0].provenance.fixtureOnly, true);
  assert.equal(values[1].imageDigest, 'sha256:' + '9'.repeat(64));
  assert.equal(values[2].commitSha, '0'.repeat(40));
  assert.equal(values[3].artifactDigests[0].value, '0'.repeat(64));
  assert.deepEqual(values[4].smokeResults.map(x => x.smokeId), ['other']);
  assert.equal(values[5].redaction.rawHeadersIncluded, true);
  assert.equal(values[6].smokeResults[0].evidence.sampleId, 'release-deploy-example-001');
});

test('all nine Reddit negatives preserve original ordered diagnostics', () => {
  const cases = redditArtifactNegativeSmokeScenarios();
  assert.deepEqual(cases.map(({ label, expectedOutput }) => [label, expectedOutput]), redditExpected);
  assert.equal(new Set(cases.map(x => x.label)).size, 9);
  assert.notStrictEqual(cases, redditArtifactNegativeSmokeScenarios());
  assert.equal(cases[0].lifecycleArtifactSha256, '0'.repeat(64));
  assert.equal(cases[0].mutateLifecycle, undefined);
  assert.equal(cases[0].mutateLive, undefined);
});

test('all Reddit artifact mutations remain rejectable', () => {
  const values = redditArtifactNegativeSmokeScenarios().map(scenario => {
    const pair = redditPair();
    scenario.mutateLive?.(pair.live);
    scenario.mutateLifecycle?.(pair.lifecycle);
    return pair;
  });
  assert.equal(values[1].lifecycle.diagnostics.password, 'not-redacted-secret-value');
  assert.deepEqual(values[2].lifecycle.lifecycleOperations.map(x => x.operation), ['other']);
  assert.equal(values[3].lifecycle.lifecycleOperations[0].observedAt, 'not-a-timestamp');
  assert.equal(values[4].live.providerResults[0].signalResults[0].observedAt, 'not-a-timestamp');
  assert.deepEqual(values[5].live.providerResults, []);
  assert.equal(values[6].live.commitSha, '0'.repeat(40));
  assert.equal(values[7].live.providerResults[0].signalResults[0].evidence.sampleId, 'reddit-live-example-001');
  assert.equal(values[8].lifecycle.lifecycleOperations[0].evidence.sampleId, 'reddit-lifecycle-example-001');
});
