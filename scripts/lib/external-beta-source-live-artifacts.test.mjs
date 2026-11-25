import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sourceFreshnessGuardForProvider,
  liveOpenConnectorsArtifact,
  redditCredentialLifecycleArtifact,
  liveRedditArtifact,
} from './external-beta-source-live-artifacts.mjs';

const providerKeys = ['hacker-news', 'rss', 'github-issues', 'reddit'];
const freshnessGuards = providerKeys.map((providerKey, index) => ({
  providerKey,
  freshnessGuard: {
    maxStalenessSeconds: 1000 + index * 100,
    minimumScanIntervalSeconds: 100 + index * 10,
    labels: [providerKey],
  },
}));

function testContext() {
  return {
    sourceCertificationPath: 'fixture/source-provider-certification.json',
    sourceCertification: { certifiedProviders: globalThis.structuredClone(freshnessGuards) },
  };
}

test('live-open evidence preserves provider ordering and format', () => {
  const artifact = liveOpenConnectorsArtifact(testContext());
  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.format, 'source-live-provider-evidence-v1');
  assert.equal(artifact.artifactId, 'live-open-connectors-evidence-v1');
  assert.deepEqual(artifact.providerResults.map((result) => result.providerKey), providerKeys.slice(0, 3));
  assert.ok(artifact.providerResults.every((result) => result.status === 'passed'));
});

test('live-open source freshness guards exactly match certification values', () => {
  const ctx = testContext();
  const artifact = liveOpenConnectorsArtifact(ctx);
  for (const result of artifact.providerResults) {
    const expected = ctx.sourceCertification.certifiedProviders.find((provider) => provider.providerKey === result.providerKey);
    assert.deepEqual(result.freshnessGuard, expected.freshnessGuard);
  }
});

test('freshness clone is detached from certification and from subsequent artifacts', () => {
  const ctx = testContext();
  const guard = sourceFreshnessGuardForProvider('hacker-news', ctx);
  guard.labels.push('modified');
  assert.deepEqual(ctx.sourceCertification.certifiedProviders[0].freshnessGuard.labels, ['hacker-news']);
  const first = liveOpenConnectorsArtifact(ctx);
  first.providerResults[0].freshnessGuard.labels.push('also-modified');
  const second = liveOpenConnectorsArtifact(ctx);
  assert.deepEqual(second.providerResults[0].freshnessGuard.labels, ['hacker-news']);
});

test('missing source provider rejects with precise existing diagnostic', () => {
  const ctx = testContext();
  ctx.sourceCertification.certifiedProviders = [];
  assert.throws(() => sourceFreshnessGuardForProvider('reddit', ctx), {
    message: 'fixture/source-provider-certification.json: missing freshnessGuard for reddit',
  });
});

test('missing provider freshnessGuard rejects without fallback', () => {
  const ctx = testContext();
  delete ctx.sourceCertification.certifiedProviders[1].freshnessGuard;
  assert.throws(() => liveOpenConnectorsArtifact(ctx), {
    message: 'fixture/source-provider-certification.json: missing freshnessGuard for rss',
  });
});

test('nested provider smoke evidence retains redaction and signal ordering', () => {
  const artifact = liveOpenConnectorsArtifact(testContext());
  assert.equal(artifact.provenance.evidenceKind, 'live_network');
  assert.equal(artifact.provenance.fixtureOnly, false);
  assert.deepEqual(artifact.redaction, {
    secretsIncluded: false,
    rawProviderPayloadsIncluded: false,
    credentialValuesIncluded: false,
    privateNetworkUrlsIncluded: false,
  });
  assert.deepEqual(artifact.providerResults[0].signalResults.map((signal) => signal.signalId), [
    'hn-live-http-smoke', 'hn-rate-limit-evidence', 'hn-provider-failure-classification',
  ]);
  assert.deepEqual(artifact.providerResults[1].signalResults.map((signal) => signal.signalId), [
    'rss-allowlisted-live-feeds', 'rss-http-cache-evidence', 'rss-ssrf-proof', 'rss-provider-failure-classification',
  ]);
  assert.deepEqual(artifact.providerResults[2].signalResults.map((signal) => signal.signalId), [
    'github-live-api-smoke', 'github-rate-limit-budget', 'github-provider-failure-classification',
  ]);
});

test('sampledAt and environment timestamps remain bound in live-open fixture', () => {
  const artifact = liveOpenConnectorsArtifact(testContext());
  for (const result of artifact.providerResults) {
    for (const signal of result.signalResults) {
      assert.equal(signal.observedAt, artifact.sampledAt);
    }
  }
  assert.equal(artifact.environment.sampledAt, artifact.sampledAt);
  assert.equal(artifact.environment.environmentId, artifact.environmentId);
  assert.equal(artifact.environment.imageDigest, artifact.imageDigest);
  assert.match(artifact.sampledAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Math.abs(Date.now() - Date.parse(artifact.sampledAt)) < 60_000);
});

test('reddit lifecycle retains four operations in canonical order', () => {
  const artifact = redditCredentialLifecycleArtifact();
  assert.equal(artifact.format, 'reddit-credential-lifecycle-redacted-v1');
  assert.equal(artifact.provenance.evidenceKind, 'credential_lifecycle');
  assert.deepEqual(artifact.lifecycleOperations.map((step) => step.operation), [
    'create', 'rotate', 'revoke', 'redacted-preview',
  ]);
  assert.ok(artifact.lifecycleOperations.every((step) => step.status === 'passed'));
});

test('reddit lifecycle evidence keeps observed times and redaction fields', () => {
  const artifact = redditCredentialLifecycleArtifact();
  assert.ok(artifact.lifecycleOperations.every((step) => step.observedAt === artifact.sampledAt));
  assert.ok(artifact.lifecycleOperations.every((step) => step.evidence.secretValuesRedacted === true && step.evidence.auditEventRecorded === true));
  assert.equal(artifact.redaction.credentialValuesIncluded, false);
});

test('reddit lifecycle output is independent between invocations', () => {
  const first = redditCredentialLifecycleArtifact();
  first.lifecycleOperations[0].evidence.summary = 'overwritten';
  const second = redditCredentialLifecycleArtifact();
  assert.notEqual(second.lifecycleOperations[0].evidence.summary, 'overwritten');
  assert.equal(second.lifecycleOperations.length, 4);
});

test('live reddit artifact binds exact requested lifecycle digest', () => {
  const expected = 'abc123-test-lifecycle-hash';
  const artifact = liveRedditArtifact(expected, testContext());
  const signals = artifact.providerResults[0].signalResults;
  const lifecycle = signals.find((signal) => signal.signalId === 'reddit-credential-lifecycle');
  assert.equal(lifecycle.evidence.lifecycleArtifactSha256, expected);
  assert.deepEqual(lifecycle.evidence.lifecycleOperations, ['create', 'rotate', 'revoke', 'redacted-preview']);
  assert.equal(lifecycle.evidence.redactionChecked, true);
});

test('live reddit preserves fail-closed authentication smoke and rate-limit evidence', () => {
  const artifact = liveRedditArtifact('hash', testContext());
  assert.deepEqual(artifact.providerResults.map((result) => result.providerKey), ['reddit']);
  assert.deepEqual(artifact.providerResults[0].signalResults.map((signal) => signal.signalId), [
    'reddit-tenant-oauth-smoke', 'reddit-auth-failure', 'reddit-rate-limit-budget', 'reddit-credential-lifecycle',
  ]);
  const auth = artifact.providerResults[0].signalResults[1];
  assert.equal(auth.evidence.failedClosed, true);
  assert.equal(auth.evidence.status, 'failed_closed');
  assert.deepEqual(artifact.providerResults[0].signalResults[2].evidence.observedHeaderNames, [
    'x-ratelimit-remaining', 'x-ratelimit-used', 'x-ratelimit-reset',
  ]);
});

test('live reddit preserves provider-specific freshness and matching environment', () => {
  const ctx = testContext();
  const artifact = liveRedditArtifact('hash', ctx);
  for (const result of artifact.providerResults) {
    for (const signal of result.signalResults) {
      assert.equal(signal.observedAt, artifact.sampledAt);
    }
  }
  assert.deepEqual(artifact.providerResults[0].freshnessGuard, ctx.sourceCertification.certifiedProviders[3].freshnessGuard);
  assert.equal(artifact.environment.sampledAt, artifact.sampledAt);
  assert.equal(artifact.environment.environmentId, artifact.environmentId);
  assert.equal(artifact.provenance.fixtureOnly, false);
});

test('missing reddit freshness policy causes the live builder to fail closed', () => {
  const ctx = testContext();
  ctx.sourceCertification.certifiedProviders = ctx.sourceCertification.certifiedProviders.slice(0, 3);
  assert.throws(() => liveRedditArtifact('hash', ctx), /missing freshnessGuard for reddit/);
});

test('builder reads certification but does not mutate it', () => {
  const ctx = testContext();
  const before = globalThis.structuredClone(ctx.sourceCertification);
  liveOpenConnectorsArtifact(ctx);
  liveRedditArtifact('hash', ctx);
  assert.deepEqual(ctx.sourceCertification, before);
});
