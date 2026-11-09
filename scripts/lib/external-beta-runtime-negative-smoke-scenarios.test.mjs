import assert from 'node:assert/strict';
import test from 'node:test';
import {
  durableRuntimeNegativeSmokeScenarios,
  stagingReliabilityNegativeSmokeScenarios,
} from './external-beta-runtime-negative-smoke-scenarios.mjs';

const durableLabels = [
  'durable runtime fixture provenance',
  'durable runtime in-memory selector',
  'durable runtime missing event relay',
  'durable runtime forbidden rollup',
  'durable runtime image digest mismatch',
  'durable runtime nested fixture marker',
  'durable runtime raw duplicate-key credential hidden by JSON parser',
];
const stagingLabels = [
  'staging reliability fixture provenance',
  'staging reliability wrong artifact id',
  'staging reliability image digest mismatch',
  'staging reliability missing postgres signal',
  'staging reliability failed durable signal',
  'staging reliability durable API mismatch',
  'staging reliability nested fixture marker',
  'staging reliability raw duplicate-key credential hidden by JSON parser',
];
const durableDiagnostics = [
  'fixture provenance',
  'must not be in-memory',
  'services must include event-relay',
  'rollup.forbiddenSelectorsFound must be false',
  'imageDigest must match BACKEND_IMAGE_DIGEST',
  'must not contain fixture marker "example"',
  'sensitive literal fragment "bearer "',
];
const stagingTargetsAndDiagnostics = [
  ['rabbitmq-staging-drill-output', 'fixture provenance'],
  ['rabbitmq-staging-drill-output', 'must use artifactId rabbitmq-staging-drill-output'],
  ['postgres-restore-drill-output', 'imageDigest must match BACKEND_IMAGE_DIGEST'],
  ['postgres-restore-drill-output', 'missing signal result "postgres-no-duplicate-side-effects"'],
  ['durable-backend-e2e-output', 'signal result "backend-loop-idempotency" must have status=passed'],
  ['durable-backend-e2e-output', 'apiBaseUrl must match API_BASE_URL'],
  ['rabbitmq-staging-drill-output', 'must not contain fixture marker "example"'],
  ['rabbitmq-staging-drill-output', 'sensitive literal fragment "bearer "'],
];
const durableFixture = () => ({
  provenance: { evidenceKind: 'runtime_selector', fixtureOnly: false },
  services: [
    { serviceId: 'api-gateway', serviceSelectors: { MONITORING_PERSISTENCE: 'prisma' }, healthCheck: { probeId: 'real-probe' } },
    { serviceId: 'event-relay', serviceSelectors: {}, healthCheck: { probeId: 'relay-probe' } },
  ],
  rollup: { forbiddenSelectorsFound: false },
  environment: { imageDigest: 'sha256:' + 'd'.repeat(64), operator: 'release-operator-1' },
});
const stagingFixture = () => ({
  provenance: { evidenceKind: 'staging_drill', fixtureOnly: false },
  artifactId: 'rabbitmq-staging-drill-output',
  imageDigest: 'sha256:' + 'a'.repeat(64),
  apiBaseUrl: 'https://api.staging.social-monitor.invalid',
  summary: 'redacted publisher confirm ack observed',
  signalResults: [
    { signalId: 'postgres-no-duplicate-side-effects', status: 'passed', evidence: { messageId: 'original' } },
    { signalId: 'backend-loop-idempotency', status: 'passed', evidence: { messageId: 'original' } },
  ],
});
function only(build, label) {
  const results = build().filter(item => item.label === label);
  assert.equal(results.length, 1, label);
  return results[0];
}
function apply(build, label, fixture) {
  const artifact = fixture();
  only(build, label).mutateArtifact(artifact);
  return artifact;
}
test('seven durable-runtime scenarios retain identity, order and distinct diagnostics', () => {
  const scenarios = durableRuntimeNegativeSmokeScenarios();
  assert.deepEqual(scenarios.map(item => item.label), durableLabels);
  assert.deepEqual(scenarios.map(item => item.expectedOutput), durableDiagnostics);
  assert.notStrictEqual(scenarios, durableRuntimeNegativeSmokeScenarios());
});
test('eight staging scenarios retain identity, order, target artifact and diagnostic', () => {
  const scenarios = stagingReliabilityNegativeSmokeScenarios();
  assert.deepEqual(scenarios.map(item => item.label), stagingLabels);
  assert.deepEqual(scenarios.map(item => [item.artifactId, item.expectedOutput]), stagingTargetsAndDiagnostics);
  assert.notStrictEqual(scenarios, stagingReliabilityNegativeSmokeScenarios());
});
test('durable fixture provenance must be rejected', () => {
  const artifact = apply(durableRuntimeNegativeSmokeScenarios, durableLabels[0], durableFixture);
  assert.equal(artifact.provenance.fixtureOnly, true);
  assert.equal(artifact.provenance.evidenceKind, 'fixture_example');
});
test('durable in-memory selector changes only the API service', () => {
  const artifact = apply(durableRuntimeNegativeSmokeScenarios, durableLabels[1], durableFixture);
  assert.equal(artifact.services[0].serviceSelectors.MONITORING_PERSISTENCE, 'in-memory');
  assert.equal(artifact.services[1].serviceId, 'event-relay');
});
test('durable missing event relay is absent from negative artifact', () => {
  const artifact = apply(durableRuntimeNegativeSmokeScenarios, durableLabels[2], durableFixture);
  assert.deepEqual(artifact.services.map(item => item.serviceId), ['api-gateway']);
});
test('durable forbidden rollup is set, not omitted', () => {
  assert.equal(apply(durableRuntimeNegativeSmokeScenarios, durableLabels[3], durableFixture).rollup.forbiddenSelectorsFound, true);
});
test('durable digest mismatch preserves original fixture', () => {
  const artifact = apply(durableRuntimeNegativeSmokeScenarios, durableLabels[4], durableFixture);
  assert.equal(artifact.environment.imageDigest, 'sha256:' + 'e'.repeat(64));
  assert.equal(durableFixture().environment.imageDigest, 'sha256:' + 'd'.repeat(64));
});
test('durable nested fixture marker stays nested', () => {
  const artifact = apply(durableRuntimeNegativeSmokeScenarios, durableLabels[5], durableFixture);
  assert.equal(artifact.services[0].healthCheck.probeId, 'runtime-selector-example-001');
});
test('durable raw duplicate credential remains visible before JSON parsing', () => {
  const raw = only(durableRuntimeNegativeSmokeScenarios, durableLabels[6]).artifactContent(durableFixture());
  assert.equal((raw.match(/"operator":/g) ?? []).length, 2);
  assert.equal(JSON.parse(raw).environment.operator, 'release-operator-1');
  assert.ok(raw.includes('raw-runtime-token-hidden-by-duplicate-key'));
});
test('staging fixture provenance is the original fixture-only evidence', () => {
  const artifact = apply(stagingReliabilityNegativeSmokeScenarios, stagingLabels[0], stagingFixture);
  assert.equal(artifact.provenance.fixtureOnly, true);
  assert.equal(artifact.provenance.evidenceKind, 'fixture_example');
});
test('staging incorrect artifact identifier is unchanged', () => {
  assert.equal(apply(stagingReliabilityNegativeSmokeScenarios, stagingLabels[1], stagingFixture).artifactId, 'wrong-staging-drill-output');
});
test('staging digest mismatch is distinct from valid digest', () => {
  const artifact = apply(stagingReliabilityNegativeSmokeScenarios, stagingLabels[2], stagingFixture);
  assert.equal(artifact.imageDigest, 'sha256:' + '9'.repeat(64));
});
test('staging missing postgres signal removes precisely that signal', () => {
  const artifact = apply(stagingReliabilityNegativeSmokeScenarios, stagingLabels[3], stagingFixture);
  assert.deepEqual(artifact.signalResults.map(item => item.signalId), ['backend-loop-idempotency']);
});
test('staging failed durable signal keeps signal and records failure', () => {
  const artifact = apply(stagingReliabilityNegativeSmokeScenarios, stagingLabels[4], stagingFixture);
  assert.equal(artifact.signalResults[1].status, 'failed');
  assert.equal(artifact.signalResults.length, 2);
});
test('staging API mismatch is isolated to the URL', () => {
  const artifact = apply(stagingReliabilityNegativeSmokeScenarios, stagingLabels[5], stagingFixture);
  assert.equal(artifact.apiBaseUrl, 'https://api.other-staging.social-monitor.invalid');
});
test('staging nested fixture marker is an unsafe evidence message ID', () => {
  const artifact = apply(stagingReliabilityNegativeSmokeScenarios, stagingLabels[6], stagingFixture);
  assert.equal(artifact.signalResults[0].evidence.messageId, 'msg-rabbitmq-confirm-example');
});
test('staging raw duplicate credential is visible before JSON parsing', () => {
  const raw = only(stagingReliabilityNegativeSmokeScenarios, stagingLabels[7]).artifactContent(stagingFixture());
  assert.equal((raw.match(/"summary":/g) ?? []).length, 2);
  assert.equal(JSON.parse(raw).summary, 'redacted publisher confirm ack observed');
  assert.ok(raw.includes('raw-staging-token-hidden-by-duplicate-key'));
});
