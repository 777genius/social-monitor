import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import {
  stagingReliabilityArtifact,
  stagingReliabilitySmokeConfigByArtifactId,
  stagingReliabilitySmokeConfigs,
} from './external-beta-staging-reliability-fixtures.mjs';

const fixturePath = new URL('../../ops/drills/fixtures/staging-reliability-artifact-examples.json', import.meta.url);
const originalFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const expectedIds = [
  'rabbitmq-staging-drill-output',
  'postgres-restore-drill-output',
  'durable-backend-e2e-output',
];
const config = (id) => stagingReliabilitySmokeConfigByArtifactId(id);
const build = (id) => stagingReliabilityArtifact(config(id), originalFixture);
const readAll = () => expectedIds.map(build);

test('staging smoke configurations retain canonical order and unique artifact IDs', () => {
  const list = stagingReliabilitySmokeConfigs();
  assert.deepEqual(list.map((item) => item.artifactId), expectedIds);
  assert.equal(new Set(list.map((item) => item.artifactId)).size, expectedIds.length);
  assert.ok(list.every((item) => typeof item.runner === 'string' && item.jobId && item.envName));
});

test('known smoke configurations return exactly the declared env and runner values', () => {
  assert.deepEqual(stagingReliabilitySmokeConfigs().map(({ artifactId, runner, requiredEnv }) => ({
    artifactId, runner, requiredEnv,
  })), [
    {
      artifactId: 'rabbitmq-staging-drill-output',
      runner: 'scripts/capture-rabbitmq-reliability-drill.ts',
      requiredEnv: { RABBITMQ_URL: 'amqps://release:...@rabbitmq.staging.social-monitor.invalid:5671' },
    },
    {
      artifactId: 'postgres-restore-drill-output',
      runner: 'scripts/capture-postgres-restore-drill.ts',
      requiredEnv: { DATABASE_URL: 'postgresql://release:...@db.staging.social-monitor.invalid:5432/social_monitor' },
    },
    {
      artifactId: 'durable-backend-e2e-output',
      runner: 'scripts/capture-durable-backend-e2e-loop.ts',
      requiredEnv: {
        API_BASE_URL: 'https://api.staging.social-monitor.invalid',
        INFINITY_CONTEXT_TOKEN: 'secret-ref:infinity-context-token',
        INFINITY_CONTEXT_URL: 'https://memory.staging.social-monitor.invalid',
      },
    },
  ]);
  for (const item of stagingReliabilitySmokeConfigs()) {
    assert.deepEqual(config(item.artifactId), item);
  }
});

test('missing smoke configuration fails closed with the original diagnostic', () => {
  assert.throws(() => config('missing-artifact'), {
    message: 'Missing staging reliability smoke config for missing-artifact',
  });
});

test('missing source fixture fails closed before constructing a synthetic artifact', () => {
  assert.throws(() => stagingReliabilityArtifact(config(expectedIds[0]), { examples: [] }), {
    message: 'Missing staging reliability fixture for rabbitmq-staging-drill-output',
  });
});

test('all three runtime artifact families retain their original envelope and signal counts', () => {
  const generated = readAll();
  assert.deepEqual(generated.map((item) => item.artifactId), expectedIds);
  assert.deepEqual(generated.map((item) => item.signalResults.length), [9, 7, 7]);
  assert.ok(generated.every((item) => item.schemaVersion === 1));
});

test('generation does not mutate source fixture examples or share arrays with them', () => {
  const before = globalThis.structuredClone(originalFixture);
  const artifact = build(expectedIds[0]);
  artifact.signalResults[0].status = 'test-mutated';
  assert.deepEqual(originalFixture, before);
  assert.notEqual(originalFixture.examples[0].signalResults[0].status, 'test-mutated');
});

test('runtime evidence remains distinctly generated on each invocation', () => {
  const a = build(expectedIds[1]);
  a.signalResults[0].evidence.summary = 'overwritten-in-test';
  const b = build(expectedIds[1]);
  assert.notEqual(b.signalResults[0].evidence.summary, 'overwritten-in-test');
});

test('staging identity, image digest and operator are copied from each exact configuration', () => {
  for (const id of expectedIds) {
    const item = build(id), chosen = config(id);
    assert.equal(item.environmentId, 'staging-alpha-1');
    assert.equal(item.imageDigest, chosen.imageDigest);
    assert.equal(item.operator, chosen.operator);
  }
});

test('original real-capture provenance and privacy flags are retained', () => {
  for (const id of expectedIds) {
    const artifact = build(id), chosen = config(id);
    assert.deepEqual(artifact.provenance, {
      evidenceKind: 'staging_drill',
      collectionMethod: chosen.collectionLabel + ' captured from beta backend environment.',
      runner: chosen.runner,
      fixtureOnly: false,
    });
    assert.equal(artifact.redaction?.rawProviderPayloadsIncluded, false);
  }
});

test('durable artifact retains API base URL while RabbitMQ and PostgreSQL omit it', () => {
  const [rabbit, postgres, durable] = readAll();
  assert.equal(Object.hasOwn(rabbit, 'apiBaseUrl'), false);
  assert.equal(Object.hasOwn(postgres, 'apiBaseUrl'), false);
  assert.equal(durable.apiBaseUrl, config(expectedIds[2]).apiBaseUrl);
});

test('artifact started/completed time window remains nine minutes long', () => {
  const before = Date.now(), artifact = build(expectedIds[0]), after = Date.now();
  const start = Date.parse(artifact.startedAt), end = Date.parse(artifact.completedAt);
  assert.equal(end - start, 9 * 60 * 1000);
  assert.ok(end >= before - 65_000 && end <= after - 55_000);
});

test('signal observedAt values stay strictly ordered inside their artifact window', () => {
  for (const artifact of readAll()) {
    const start = Date.parse(artifact.startedAt), end = Date.parse(artifact.completedAt);
    const observed = artifact.signalResults.map((item) => Date.parse(item.observedAt));
    assert.ok(observed.every((time) => Number.isFinite(time) && time > start && time < end));
    assert.deepEqual(observed, [...observed].sort((a,b) => a-b));
    assert.equal(new Set(observed).size, observed.length);
  }
});

test('all original signal statuses and signal IDs are retained in their source order', () => {
  const inputs = new Map(originalFixture.examples.map((example) => [example.artifactId, example]));
  for (const artifact of readAll()) {
    const original = inputs.get(artifact.artifactId);
    assert.deepEqual(artifact.signalResults.map((signal) => signal.signalId),
      original.signalResults.map((signal) => signal.signalId));
    assert.ok(artifact.signalResults.every((signal) => signal.status === 'passed'));
  }
});

test('nested RabbitMQ confirm ack time is refreshed to the matching signal time', () => {
  const artifact = build(expectedIds[0]);
  const confirm = artifact.signalResults.find((item) => item.signalId === 'rabbitmq-publisher-confirms');
  assert.equal(confirm.evidence.confirmAckAt, confirm.observedAt);
  assert.equal(confirm.evidence.messageId, 'msg-rabbitmq-confirm-alpha');
});

test('nested restore timestamps stay aligned to their owner signal time', () => {
  const artifact = build(expectedIds[1]);
  const signal = artifact.signalResults.find((item) => item.signalId === 'postgres-restore-rpo-rto');
  assert.equal(signal.evidence.restoreStartedAt, signal.observedAt);
  assert.equal(signal.evidence.restoreCompletedAt, signal.observedAt);
});

test('scheduled scan next-run boundary remains exactly one minute after its observed completion', () => {
  const artifact = build(expectedIds[2]);
  const signal = artifact.signalResults.find((item) => item.signalId === 'backend-loop-scheduled-scan');
  const scan = signal.evidence.scheduledScan;
  assert.equal(scan.completedAt, signal.observedAt);
  assert.equal(Date.parse(scan.nextRunAtAfterSchedule) - Date.parse(signal.observedAt), 60_000);
});

test('nested fixture identity markers are sanitized in values without mutating metadata keys', () => {
  const artifact = build(expectedIds[0]);
  const values = (value) => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(values);
    if (value !== null && typeof value === 'object') return Object.values(value).flatMap(values);
    return [];
  };
  assert.ok(values(artifact).every((value) => !/synthetic|fixture|example/i.test(value)));
  assert.equal(artifact.provenance.fixtureOnly, false);
});

test('configuration builder returns fresh data and cannot be mutated across calls', () => {
  const first = stagingReliabilitySmokeConfigs();
  first[0].collectionLabel = 'modified';
  first[0].requiredEnv.RABBITMQ_URL = 'modified';
  const second = stagingReliabilitySmokeConfigs();
  assert.notEqual(second[0].collectionLabel, 'modified');
  assert.notEqual(second[0].requiredEnv.RABBITMQ_URL, 'modified');
});
