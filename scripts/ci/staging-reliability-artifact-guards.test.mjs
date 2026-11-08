import assert from 'node:assert/strict';
import test from 'node:test';
import { createStagingReliabilityArtifactGuards } from '../lib/staging-reliability-artifact-guards.mjs';

function context() {
  const violations = [];
  return { guards: createStagingReliabilityArtifactGuards(violations), violations };
}

test('fully redacted staging evidence has no privacy findings', () => {
  const { guards, violations } = context();
  guards.validateRedaction({
    redaction: {
      secretsIncluded: false, rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false, brokerUrlsIncluded: false,
    },
  }, 'artifact');
  assert.deepEqual(violations, []);
});

test('missing redaction object fails closed with the existing diagnostic', () => {
  const { guards, violations } = context();
  guards.validateRedaction({ redaction: null }, 'artifact');
  assert.deepEqual(violations, ['artifact: redaction must be an object']);
});

test('all four raw-data inclusion flags remain prohibited', () => {
  const { guards, violations } = context();
  guards.validateRedaction({ redaction: {
    secretsIncluded: true, rawProviderPayloadsIncluded: true,
    databaseUrlsIncluded: true, brokerUrlsIncluded: true,
  } }, 'artifact');
  assert.deepEqual(violations, [
    'artifact: redaction.secretsIncluded must be false',
    'artifact: redaction.rawProviderPayloadsIncluded must be false',
    'artifact: redaction.databaseUrlsIncluded must be false',
    'artifact: redaction.brokerUrlsIncluded must be false',
  ]);
});

test('redaction nested content still detects forbidden literal markers', () => {
  const { guards, violations } = context();
  guards.validateNoSensitiveArtifactContent('Contains '+['Be','arer '].join('')+'example', 'artifact');
  assert.deepEqual(violations, [
    'artifact: passed staging artifact must not contain sensitive fragment "bearer "',
  ]);
});

test('credential query patterns reject unredacted values independently of literal blacklist', () => {
  const { guards, violations } = context();
  guards.validateNoSensitiveArtifactContent('https://example.invalid/?sig=nonmasked', 'artifact');
  assert.deepEqual(violations, [
    'artifact: passed staging artifact must not contain sensitive query credential',
  ]);
});

test('header credential patterns reject unredacted values', () => {
  const { guards, violations } = context();
  guards.validateNoSensitiveArtifactContent('x-amz-security-token: example', 'artifact');
  assert.deepEqual(violations, [
    'artifact: passed staging artifact must not contain sensitive header credential',
  ]);
});

test('regex matcher state remains deterministic after consecutive artifact scans', () => {
  const { guards, violations } = context();
  guards.validateNoSensitiveArtifactContent('sig=abc', 'artifact');
  guards.validateNoSensitiveArtifactContent('sig=abc', 'artifact');
  assert.deepEqual(violations, [
    'artifact: passed staging artifact must not contain sensitive query credential',
    'artifact: passed staging artifact must not contain sensitive query credential',
  ]);
});

test('clean diagnostic text without credentials passes', () => {
  const { guards, violations } = context();
  guards.validateNoSensitiveArtifactContent('safe trace data and audit metadata', 'artifact');
  assert.deepEqual(violations, []);
});

test('real staging nested fixture markers preserve exact field path', () => {
  const { guards, violations } = context();
  guards.validateNoRealArtifactFixtureMarkers({ event: { evidence: 'req-fixture-001' } }, 'artifact');
  assert.deepEqual(violations, [
    'artifact: event.evidence must not contain fixture marker "fixture"',
  ]);
});

test('real staging array marker paths retain bracketed indices', () => {
  const { guards, violations } = context();
  guards.validateNoRealArtifactFixtureMarkers({ signals: [{ id: 'signal-synthetic-1' }] }, 'artifact');
  assert.deepEqual(violations, [
    'artifact: signals.[0].id must not contain fixture marker "synthetic"',
  ]);
});

test('real staging marker-free records and primitives are accepted', () => {
  const { guards, violations } = context();
  guards.validateNoRealArtifactFixtureMarkers({ signals: [{ id: 'signal-valid-1' }], ok: true }, 'artifact');
  assert.deepEqual(violations, []);
});

test('real evidence identities reject fixture-like values with original provenance diagnostics', () => {
  const { guards, violations } = context();
  guards.validateRealArtifactIdentity({ environmentId: 'prod-staging-fixture-1', operator: 'security-owner' }, 'artifact');
  assert.ok(violations.some(x => x.includes('artifact.environmentId') && x.includes('fixture')));
});

test('real evidence identities accept non-fixture staging metadata', () => {
  const { guards, violations } = context();
  guards.validateRealArtifactIdentity({ environmentId: 'staging-alpha-1', operator: 'security-owner' }, 'artifact');
  assert.deepEqual(violations, []);
});

test('HTTP and HTTPS artifact URLs accept noncredential URLs only', () => {
  const { guards } = context();
  assert.equal(guards.isHttpUrlWithoutCredentials('https://api.internal.invalid/'), true);
  assert.equal(guards.isHttpUrlWithoutCredentials('http://localhost:8080'), true);
  assert.equal(guards.isHttpUrlWithoutCredentials('https://user:pass@api.internal.invalid'), false);
  assert.equal(guards.isHttpUrlWithoutCredentials('ftp://api.internal.invalid'), false);
  assert.equal(guards.isHttpUrlWithoutCredentials('invalid-url'), false);
  assert.equal(guards.isHttpUrlWithoutCredentials(''), false);
});

test('separate diagnostics contexts cannot leak findings across checks', () => {
  const first = context(), second = context();
  first.guards.validateNoSensitiveArtifactContent('sig=abc', 'first');
  second.guards.validateNoSensitiveArtifactContent('safe artifact', 'second');
  assert.equal(first.violations.length, 1);
  assert.deepEqual(second.violations, []);
});

test('guards do not mutate caller-provided artifact objects', () => {
  const { guards } = context(), artifact = {
    environmentId: 'staging-alpha', operator: 'owner-1',
    redaction: { secretsIncluded: false, rawProviderPayloadsIncluded: false,
      databaseUrlsIncluded: false, brokerUrlsIncluded: false },
    content: [{ sampleId: 'sample-valid-1' }],
  };
  const before = globalThis.structuredClone(artifact);
  guards.validateRealArtifactIdentity(artifact, 'artifact');
  guards.validateNoRealArtifactFixtureMarkers(artifact, 'artifact');
  guards.validateRedaction(artifact, 'artifact');
  assert.deepEqual(artifact, before);
});
