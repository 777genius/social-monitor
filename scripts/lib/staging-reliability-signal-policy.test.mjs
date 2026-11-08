import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateSignalResults,
  validateSignalEvidenceSchemaMap,
  validateArtifactTimeWindow,
} from './staging-reliability-signal-policy.mjs';

const evidencePath = 'ops/drills/staging-reliability-evidence.json';
const startedAt = '2026-11-08T12:00:00Z';
const completedAt = '2026-11-08T12:30:00Z';
const observedAt = '2026-11-08T12:15:00Z';
const signalId = 'synthetic-staging-signal';
const artifact = () => ({
  path: 'staging-artifact', artifactId: 'synthetic-staging-artifact',
  startedAt, completedAt,
});
const signal = () => ({ signalId });
const result = () => ({
  signalId, status: 'passed', observedAt,
  evidence: { recordId: 'sanitized-proof' },
});
const context = (violations = [], required = new Set([signalId]), shape = new Map([
  [signalId, [['recordId', 'non_empty_string']]],
])) => ({
  violations, requiredSignalIds: required,
  requiredEvidenceShapeBySignalId: shape, evidencePath,
});
const validate = (results, ctx = context(), expected = [signal()], a = artifact()) => {
  validateSignalResults({ signalResults: results }, a, expected, ctx);
  return ctx.violations;
};
const specialContext = (key, fieldShape = []) => context([], new Set([key]), new Map([[key, fieldShape]]));
const specialResult = (key, evidence) => ({
  signalId: key, status: 'passed', observedAt, evidence,
});

test('valid passed signal preserves original fields, input and diagnostic sink', () => {
  const rows = [result()];
  const snapshot = globalThis.structuredClone(rows), ctx = context(['prior']);
  validateSignalResults({ signalResults: rows }, artifact(), [signal()], ctx);
  assert.deepEqual(ctx.violations, ['prior']);
  assert.deepEqual(rows, snapshot);
});

test('non-array signal results fail closed without throwing', () => {
  assert.deepEqual(validate(null), ['staging-artifact: signalResults must be an array']);
});

test('missing required signal records are detected after scan', () => {
  assert.deepEqual(validate([]), [
    'staging-artifact: missing signal result "synthetic-staging-signal" for synthetic-staging-artifact',
  ]);
});

test('invalid item fails closed and retains coverage diagnostics', () => {
  assert.deepEqual(validate([null]), [
    'staging-artifact: every signalResults item must be an object',
    'staging-artifact: missing signal result "synthetic-staging-signal" for synthetic-staging-artifact',
  ]);
});

test('duplicate signal records report once and do not hide successful evidence', () => {
  assert.deepEqual(validate([result(), result()]), [
    'staging-artifact: duplicate signal result "synthetic-staging-signal"',
  ]);
});

test('unsupported or failed signal result accumulates bounded errors in original order', () => {
  assert.deepEqual(validate([{
    signalId: 'unknown-id', status: 'failed', observedAt: 'bad', evidence: {},
  }]), [
    'staging-artifact: unsupported signal result "unknown-id" for synthetic-staging-artifact',
    'staging-artifact: signal result "unknown-id" must have status=passed',
    'staging-artifact: signal result "unknown-id" observedAt must be an ISO timestamp',
    'staging-artifact: signal result "unknown-id" must include non-empty evidence',
    'staging-artifact: missing signal result "synthetic-staging-signal" for synthetic-staging-artifact',
  ]);
});

test('missing evidence schema rejects a non-empty evidence object', () => {
  const ctx = context([], new Set([signalId]), new Map());
  assert.deepEqual(validate([result()], ctx), [
    'staging-artifact: signal result "synthetic-staging-signal" has no evidence schema',
  ]);
});

test('typed evidence violations preserve field paths and exact type names', () => {
  const row = result(); row.evidence.recordId = '';
  assert.deepEqual(validate([row]), [
    'staging-artifact: signal result "synthetic-staging-signal" evidence.recordId must be non_empty_string',
  ]);
});

test('evidence schema validation preserves missing, duplicate and unsupported type diagnostics', () => {
  const rules = new Map([
    [signalId, [['recordId', 'non_empty_string'], ['recordId', 'alien_type']]],
    ['extra', [['status', 'boolean_true']]],
  ]);
  const ctx = context([], new Set([signalId, 'missing']), rules);
  validateSignalEvidenceSchemaMap(ctx);
  assert.deepEqual(ctx.violations, [
    evidencePath + ': evidence schema for "synthetic-staging-signal" duplicates field "recordId"',
    evidencePath + ': evidence schema for "synthetic-staging-signal" uses unsupported type "alien_type"',
    evidencePath + ': missing signal-specific evidence schema for "missing"',
    evidencePath + ': evidence schema references unsupported signal "extra"',
  ]);
});

test('empty schema field names and missing shape fail closed', () => {
  const rules = new Map([[signalId, [['', 'non_empty_string']]]]);
  const ctx = context([], new Set([signalId, 'missing']), rules);
  validateSignalEvidenceSchemaMap(ctx);
  assert.deepEqual(ctx.violations, [
    evidencePath + ': evidence schema for "synthetic-staging-signal" has an empty field path',
    evidencePath + ': missing signal-specific evidence schema for "missing"',
  ]);
});

test('artifact completion must not precede its beginning', () => {
  const ctx = context();
  validateArtifactTimeWindow({ startedAt: completedAt, completedAt: startedAt }, 'artifact', ctx);
  assert.deepEqual(ctx.violations, [
    'artifact: completedAt must be greater than or equal to startedAt',
  ]);
});

test('out-of-window signal time fails without changing the artifact', () => {
  const row = result(); row.observedAt = '2026-11-08T12:45:00Z';
  assert.deepEqual(validate([row]), [
    'staging-artifact: signal result "synthetic-staging-signal" observedAt must be within artifact startedAt/completedAt',
  ]);
});

test('scheduled-scan evidence requires the next run strictly after completion', () => {
  const id = 'backend-loop-scheduled-scan';
  const evidence = {
    scheduledScan: { completedAt: observedAt, nextRunAtAfterSchedule: observedAt },
  };
  const ctx = specialContext(id);
  assert.deepEqual(validate([specialResult(id, evidence)], ctx, [{ signalId: id }]), [
    'staging-artifact: signal result "backend-loop-scheduled-scan" evidence.scheduledScan.nextRunAtAfterSchedule must be after completedAt',
  ]);
});

test('auto-summary evidence enforces request and completion chronology', () => {
  const id = 'backend-loop-auto-summary-scheduler';
  const evidence = {
    autoSummary: {
      latestFeedItemObservedAt: '2026-11-08T12:20:00Z',
      requestedAt: '2026-11-08T12:10:00Z',
      completedAt: '2026-11-08T12:05:00Z',
    },
  };
  const ctx = specialContext(id);
  assert.deepEqual(validate([specialResult(id, evidence)], ctx, [{ signalId: id }]), [
    'staging-artifact: signal result "backend-loop-auto-summary-scheduler" evidence.autoSummary.requestedAt must be after latestFeedItemObservedAt',
    'staging-artifact: signal result "backend-loop-auto-summary-scheduler" evidence.autoSummary.completedAt must be after requestedAt',
  ]);
});

test('RabbitMQ ack must lower queue depth', () => {
  const id = 'rabbitmq-consumer-ack';
  const ctx = specialContext(id);
  assert.deepEqual(validate([
    specialResult(id, { queueDepthBeforeAck: 2, queueDepthAfterAck: 2 }),
  ], ctx, [{ signalId: id }]), [
    'staging-artifact: signal result "rabbitmq-consumer-ack" evidence.queueDepthAfterAck must be lower than queueDepthBeforeAck',
  ]);
});

test('PostgreSQL replay matched claims require matching counts and fingerprints', () => {
  const id = 'postgres-outbox-inbox-idempotency', ctx = specialContext(id);
  const evidence = {
    countsMatched: true, beforeCounts: { a: 1 }, afterCounts: { a: 2 },
    fingerprintsMatched: true, beforeFingerprints: { a: 'one' }, afterFingerprints: { a: 'two' },
  };
  assert.deepEqual(validate([specialResult(id, evidence)], ctx, [{ signalId: id }]), [
    'staging-artifact: signal result "postgres-outbox-inbox-idempotency" countsMatched=true requires beforeCounts and afterCounts to match',
    'staging-artifact: signal result "postgres-outbox-inbox-idempotency" fingerprintsMatched=true requires beforeFingerprints and afterFingerprints to match',
  ]);
});

test('PostgreSQL duplicate replay must preserve counts and the single-attempt boundary', () => {
  const id = 'postgres-no-duplicate-side-effects', ctx = specialContext(id);
  const evidence = {
    duplicateProbeBeforeCount: 2, duplicateProbeAfterCount: 3,
    duplicateInsertSuppressed: true,
    beforeResumeCounts: { a: 1 }, afterResumeCounts: { a: 2 },
  };
  assert.deepEqual(validate([specialResult(id, evidence)], ctx, [{ signalId: id }]), [
    'staging-artifact: signal result "postgres-no-duplicate-side-effects" duplicate probe counts must remain stable',
    'staging-artifact: signal result "postgres-no-duplicate-side-effects" duplicate probe must start from exactly one delivery attempt',
    'staging-artifact: signal result "postgres-no-duplicate-side-effects" beforeResumeCounts and afterResumeCounts must match',
  ]);
});

test('durable topic-to-delivery evidence requires five covered provider feed results', () => {
  const id = 'backend-loop-topic-to-delivery-audit', ctx = specialContext(id);
  const evidence = { providerFeedCounts: [{ providerKey: 'rss' }] };
  assert.deepEqual(validate([specialResult(id, evidence)], ctx, [{ signalId: id }]), [
    'staging-artifact: signal result "backend-loop-topic-to-delivery-audit" must include github-issues provider feed evidence',
    'staging-artifact: signal result "backend-loop-topic-to-delivery-audit" must include github-trending-page provider feed evidence',
    'staging-artifact: signal result "backend-loop-topic-to-delivery-audit" must include hacker-news provider feed evidence',
    'staging-artifact: signal result "backend-loop-topic-to-delivery-audit" must include reddit provider feed evidence',
  ]);
});

test('reader-brief evidence checks source-mix and citation provider coverage independently', () => {
  const id = 'backend-loop-reader-brief', ctx = specialContext(id);
  const evidence = {
    readerBrief: { sourceMixProviderKeys: ['rss'], citationProviderKeys: ['rss'] },
  };
  const actual = validate([specialResult(id, evidence)], ctx, [{ signalId: id }]);
  assert.equal(actual.length, 8);
  assert.ok(actual.includes('staging-artifact: signal result "backend-loop-reader-brief" must include github-issues in readerBrief.sourceMixProviderKeys'));
  assert.ok(actual.includes('staging-artifact: signal result "backend-loop-reader-brief" must include github-issues in readerBrief.citationProviderKeys'));
  assert.ok(actual.every((s) => !s.includes('rss in readerBrief')));
});
