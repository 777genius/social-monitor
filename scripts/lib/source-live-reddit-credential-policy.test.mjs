import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLiveRedditCredentialPolicy } from './source-live-reddit-credential-policy.mjs';

const format = 'reddit-credential-lifecycle-redacted-v1';
const ops = ['create', 'rotate', 'revoke', 'redacted-preview'];
function fixture() {
  return {
    schemaVersion: 1,
    format,
    artifactId: 'credential-lifecycle-evidence-v1',
    environmentId: 'staging-environment-42',
    imageDigest: 'sha256:' + 'a'.repeat(64),
    commitSha: 'b'.repeat(40),
    operator: 'beta-operator-42',
    sampledAt: '2026-11-09T11:00:00.000Z',
    provenance: {
      evidenceKind: 'fixture_example',
      fixtureOnly: true,
      collectionMethod: 'test-harness',
      runner: 'synthetic-unit',
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    lifecycleOperations: ops.map(operation => ({
      operation, status: 'passed', observedAt: '2026-11-09T11:00:00.000Z',
      evidence: { summary: 'operation confirmed', secretValuesRedacted: true, auditEventRecorded: true },
    })),
  };
}
function createHarness() {
  const violations = [];
  const calls = [];
  const policy = createSourceLiveRedditCredentialPolicy({
    violations,
    redditCredentialLifecycleFormat: format,
    redditCredentialLifecycleEvidenceKind: 'credential_lifecycle',
    requiredRedditLifecycleOperations: new Set(ops),
    validateNoRealArtifactFixtureMarkers: () => calls.push('fixture-markers'),
    validateNoSensitiveArtifactLiterals: () => calls.push('sensitive-literals'),
  });
  return { violations, calls, ...policy };
}

test('all four fixture lifecycle operations with redaction and provenance pass', () => {
  const h = createHarness();
  h.validateRedditCredentialLifecycleArtifact(fixture(), { label: 'fixture', allowFixture: true });
  assert.deepEqual(h.violations, []);
  assert.deepEqual(h.calls, ['sensitive-literals']);
});

test('non-object, format, digests and timestamps fail closed', () => {
  const h = createHarness();
  h.validateRedditCredentialLifecycleArtifact(null, { label: 'invalid', allowFixture: true });
  const bad = fixture();
  bad.format = 'invalid';
  bad.imageDigest = 'sha256:untrusted';
  bad.commitSha = 'short';
  bad.sampledAt = 'yesterday';
  h.validateRedditCredentialLifecycleArtifact(bad, { label: 'invalid', allowFixture: true });
  for (const msg of ['artifact must be an object', 'format must be', 'immutable sha256 digest', 'full git commit SHA', 'ISO timestamp']) {
    assert.ok(h.violations.some(x => x.includes(msg)), msg);
  }
});

test('missing lifecycle operation and unsupported operation are rejected', () => {
  const h = createHarness();
  const bad = fixture();
  bad.lifecycleOperations = bad.lifecycleOperations.filter(x => x.operation !== 'revoke');
  bad.lifecycleOperations.push({operation:'unexpected', status:'pending', observedAt:'bad', evidence:{}});
  h.validateRedditCredentialLifecycleOperations(bad.lifecycleOperations, 'operations');
  for (const msg of ['must include revoke', '.operation is unsupported', '.status must be passed', '.observedAt must be an ISO timestamp', '.secretValuesRedacted must be true', '.auditEventRecorded must be true']) {
    assert.ok(h.violations.some(x=>x.includes(msg)), msg);
  }
});

test('missing lifecycle operations, invalid entries and redaction flags fail closed', () => {
  const h = createHarness();
  h.validateRedditCredentialLifecycleOperations([], 'empty');
  h.validateRedditCredentialLifecycleOperations([null], 'invalid');
  h.validateArtifactRedaction({redaction:{secretsIncluded:true}}, 'redacted');
  assert.ok(h.violations.some(x=>x.includes('non-empty array')));
  assert.ok(h.violations.some(x=>x.includes('must be an object')));
  assert.ok(h.violations.some(x=>x.includes('redaction.secretsIncluded must be false')));
  assert.ok(h.violations.some(x=>x.includes('redaction.privateNetworkUrlsIncluded must be false')));
});

test('mismatched live source identity and provenance are still checked', () => {
  const h = createHarness();
  const bad = fixture();
  bad.provenance = { evidenceKind:'credential_lifecycle',fixtureOnly:false,collectionMethod:'manual-ops',runner:'operator' };
  h.validateRedditCredentialLifecycleArtifact(bad, {
    label:'live', expectedEnvironmentId:'different-env', expectedImageDigest:'sha256:'+'c'.repeat(64),
    expectedCommitSha:'c'.repeat(40), expectedOperator:'different-operator',
  });
  for (const msg of ['environmentId must match','imageDigest must match','commitSha must match','operator must match']) {
    assert.ok(h.violations.some(x=>x.includes(msg)), msg);
  }
  assert.deepEqual(h.calls,['fixture-markers','sensitive-literals']);
});

test('redaction is required even when the caller passes a malformed object', () => {
  const h=createHarness();
  h.validateArtifactRedaction({redaction:null},'missing');
  h.validateArtifactRedaction({redaction:{secretsIncluded:false}},'partial');
  assert.ok(h.violations.some(x=>x.includes('redaction object is required')));
  assert.ok(h.violations.some(x=>x.includes('redaction.credentialValuesIncluded must be false')));
});

test('artifact validator forwards nested redaction and operation checks', () => {
  const badRedaction = fixture();
  badRedaction.redaction.secretsIncluded = true;
  const redactionHarness = createHarness();
  redactionHarness.validateRedditCredentialLifecycleArtifact(badRedaction, { label: 'fixture', allowFixture: true });
  assert.ok(redactionHarness.violations.includes('fixture: redaction.secretsIncluded must be false'));

  const badOperations = fixture();
  badOperations.lifecycleOperations = badOperations.lifecycleOperations.filter(x => x.operation !== 'revoke');
  const operationsHarness = createHarness();
  operationsHarness.validateRedditCredentialLifecycleArtifact(badOperations, { label: 'fixture', allowFixture: true });
  assert.ok(operationsHarness.violations.includes('fixture: lifecycleOperations must include revoke'));
});

test('live artifact independently rejects fixture provenance and forbidden identity markers', () => {
  const bad = fixture();
  bad.environmentId = 'fixture-live-environment';
  bad.operator = 'mock-live-operator';
  const h = createHarness();
  h.validateRedditCredentialLifecycleArtifact(bad, { label: 'live' });
  for (const message of [
    'live.environmentId must not contain "fixture" for reddit credential lifecycle artifacts',
    'live.operator must not contain "mock" for reddit credential lifecycle artifacts',
    'live: provenance.evidenceKind must be credential_lifecycle',
    'live: provenance.fixtureOnly must be false for reddit credential lifecycle artifacts',
  ]) {
    assert.ok(h.violations.includes(message), message);
  }
  assert.deepEqual(h.calls, ['fixture-markers', 'sensitive-literals']);
});
