import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requiredSignalIds,
  requiredEvidenceShapeBySignalId,
} from '../lib/staging-reliability-required-evidence-schemas.mjs';
import { validateSignalEvidenceSchemaMap } from '../lib/staging-reliability-signal-policy.mjs';

const expectedIds = [
  "rabbitmq-publisher-confirms",
  "rabbitmq-persistent-publish",
  "rabbitmq-consumer-ack",
  "rabbitmq-consumer-nack-retry",
  "rabbitmq-poison-message-dlx",
  "rabbitmq-quorum-delivery-limit",
  "rabbitmq-worker-restart-recovery",
  "rabbitmq-queue-lag-metrics",
  "rabbitmq-event-relay-retry",
  "postgres-backup-created",
  "postgres-restore-rpo-rto",
  "postgres-migration-version",
  "postgres-validation-queries",
  "postgres-outbox-inbox-idempotency",
  "postgres-worker-pause-resume",
  "postgres-no-duplicate-side-effects",
  "backend-loop-topic-to-delivery-audit",
  "backend-loop-scheduled-scan",
  "backend-loop-auto-summary-scheduler",
  "backend-loop-summary-memory",
  "backend-loop-reader-brief",
  "backend-loop-tenant-isolation",
  "backend-loop-idempotency"
];
const evidencePath = 'ops/drills/staging-reliability-evidence.json';
const cloneSchemas = () => new Map([...requiredEvidenceShapeBySignalId].map(
  ([signal, fields]) => [signal, fields.map((entry) => [...entry])],
));
const diagnose = (ids = requiredSignalIds, schemas = requiredEvidenceShapeBySignalId) => {
  const violations = [];
  validateSignalEvidenceSchemaMap({
    requiredSignalIds: ids, requiredEvidenceShapeBySignalId: schemas, evidencePath, violations,
  });
  return violations;
};

test('all 23 original signal IDs remain required in canonical order', () => {
  assert.deepEqual([...requiredSignalIds], expectedIds);
});

test('schema map covers precisely the original 23 signals without duplicates', () => {
  assert.equal(requiredEvidenceShapeBySignalId.size, 23);
  assert.deepEqual([...requiredEvidenceShapeBySignalId.keys()].sort(), [...expectedIds].sort());
});

test('every signal has unique, nonempty required evidence field names', () => {
  for (const [signal, fields] of requiredEvidenceShapeBySignalId) {
    assert.ok(Array.isArray(fields) && fields.length > 0, signal);
    const names = fields.map(([field]) => field);
    assert.ok(names.every(field => typeof field === 'string' && field.trim()), signal);
    assert.equal(new Set(names).size, names.length, signal);
  }
});

test('unchanged production schema validator accepts the entire extracted map', () => {
  assert.deepEqual(diagnose(), []);
});

test('RabbitMQ publisher confirmation fields and types retain their original ordering', () => {
  assert.deepEqual(requiredEvidenceShapeBySignalId.get('rabbitmq-publisher-confirms'), [
    ['summary', 'non_empty_string'],
    ['queueName', 'non_empty_string'],
    ['messageId', 'non_empty_string'],
    ['confirmAckAt', 'iso_timestamp'],
    ['publishMode', 'non_empty_string'],
    ['brokerUrlRedacted', 'boolean_true'],
    ['imageDigestMatched', 'boolean_true'],
  ]);
});

test('PostgreSQL restore RPO/RTO retains its strict durations and paused worker flag', () => {
  assert.deepEqual(requiredEvidenceShapeBySignalId.get('postgres-restore-rpo-rto'), [
    ['summary', 'non_empty_string'],
    ['restoreStartedAt', 'iso_timestamp'],
    ['restoreCompletedAt', 'iso_timestamp'],
    ['rpoMinutes', 'positive_integer'],
    ['rtoMinutes', 'positive_integer'],
    ['workersPausedBeforeRestore', 'boolean_true'],
  ]);
});

test('memory evidence fields keep privacy, provider scope and matching constraints', () => {
  const fields = requiredEvidenceShapeBySignalId.get('backend-loop-summary-memory');
  assert.deepEqual(fields.slice(-4), [
    ['memory.sourceRefCount', 'non_negative_integer'],
    ['memory.renderedTextChars', 'positive_integer'],
    ['memory.memoryEffectMatched', 'boolean_true'],
    ['rawMemoryTextIncluded', 'boolean_false'],
  ]);
  assert.deepEqual(fields.find(([key]) => key === 'memory.providerScopeExternalRef'), [
    'memory.providerScopeExternalRef', 'non_empty_string',
  ]);
});

test('reader brief retains three-top-read minimum and citation source coverage', () => {
  const fields = requiredEvidenceShapeBySignalId.get('backend-loop-reader-brief');
  assert.ok(fields.some(([key, type]) => key === 'readerBrief.topReadCount' && type === 'at_least_three_integer'));
  assert.ok(fields.some(([key, type]) => key === 'readerBrief.citationProviderKeys' && type === 'non_empty_string_array'));
  assert.ok(fields.some(([key, type]) => key === 'readerBrief.qualityStatus' && type === 'non_empty_string'));
});

test('idempotency evidence still requires absence of duplicate side effects', () => {
  assert.deepEqual(requiredEvidenceShapeBySignalId.get('backend-loop-idempotency'), [
    ['summary', 'non_empty_string'],
    ['idempotencyKeys', 'non_empty_string_array'],
    ['responseIds', 'non_empty_string_array'],
    ['stableDurableCounts', 'non_empty_object'],
    ['duplicateSideEffectsObserved', 'boolean_false'],
  ]);
});

test('missing required schema fails closed with the original diagnostic', () => {
  const altered = cloneSchemas();
  altered.delete('rabbitmq-publisher-confirms');
  assert.deepEqual(diagnose(requiredSignalIds, altered), [
    evidencePath + ': missing signal-specific evidence schema for "rabbitmq-publisher-confirms"',
  ]);
});

test('unsupported schema type fails closed without affecting the shared map', () => {
  const altered = cloneSchemas();
  altered.get('rabbitmq-publisher-confirms')[0][1] = 'unsupported_new_type';
  const issues = diagnose(requiredSignalIds, altered);
  assert.deepEqual(issues, [
    evidencePath + ': evidence schema for "rabbitmq-publisher-confirms" uses unsupported type "unsupported_new_type"',
  ]);
  assert.equal(requiredEvidenceShapeBySignalId.get('rabbitmq-publisher-confirms')[0][1], 'non_empty_string');
});

test('duplicate field names and extra signal IDs retain independent fail-closed diagnostics', () => {
  const altered = cloneSchemas();
  altered.get('rabbitmq-publisher-confirms').push(['summary', 'non_empty_string']);
  altered.set('not-a-supported-signal', [['summary', 'non_empty_string']]);
  const issues = diagnose(requiredSignalIds, altered);
  assert.ok(issues.includes(evidencePath + ': evidence schema for "rabbitmq-publisher-confirms" duplicates field "summary"'));
  assert.ok(issues.includes(evidencePath + ': evidence schema references unsupported signal "not-a-supported-signal"'));
  assert.equal(issues.length, 2);
});
