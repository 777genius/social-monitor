import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { summaryFeedbackSamplesArtifact } from './external-beta-summary-feedback-fixtures.mjs';

const exampleUrl = new URL('../../ops/release/fixtures/redacted-summary-feedback-samples-examples.json', import.meta.url);
const original = JSON.parse(readFileSync(exampleUrl, 'utf8'));
const fixture = () => globalThis.structuredClone(original);
const build = (document = fixture()) => summaryFeedbackSamplesArtifact(document);
const ids = [
  'dogfood-feedback-summary-001',
  'dogfood-feedback-summary-002',
  'dogfood-feedback-summary-003',
];

test('builder retains exact schema, scope, and envelope', () => {
  const x = build();
  assert.equal(x.schemaVersion, 1);
  assert.equal(x.artifactFormat, 'redacted-summary-feedback-samples-v1');
  assert.equal(x.scope, 'backend-only');
  assert.equal(x.frontendPolicy, 'deferred_contract_only');
});

test('all three samples retain categories, classifications, and order', () => {
  const x = build();
  assert.deepEqual(x.samples.map(y => y.category), ['wrong_fact', 'bad_citation', 'missing_source']);
  assert.deepEqual(x.samples.map(y => y.classification), ['blocker', 'blocker', 'evidence_based_opportunity']);
  assert.deepEqual(x.samples.map(y => y.feedbackId), ids);
});

test('sample evidence identifiers are unique and preserve source provider keys', () => {
  const x = build();
  for (const [index, sample] of x.samples.entries()) {
    const suffix = String(index + 1).padStart(3, '0');
    assert.equal(sample.summaryEvidence.summaryId, 'dogfood-summary-' + suffix);
    assert.equal(sample.summaryEvidence.interestId, 'dogfood-topic-summary-001');
    assert.equal(sample.summaryEvidence.citationId, 'dogfood-citation-' + suffix);
    assert.equal(sample.summaryEvidence.feedItemId, 'dogfood-feed-item-' + suffix);
    assert.equal(sample.summaryEvidence.sourceItemId, 'dogfood-source-item-' + suffix);
    assert.equal(sample.summaryEvidence.providerKey, original.samples[index].summaryEvidence.providerKey);
  }
});

test('redacted sample summaries replace template wording and remain free of fixture markers', () => {
  const x = build();
  assert.ok(x.samples.every(y => y.sanitizedSignal.startsWith('Internal dogfood review found')));
  assert.ok(x.samples.every(y => y.redactedComment.startsWith('Reviewer noted that')));
  assert.ok(x.samples.every(y => !/synthetic|fixture|example/i.test(y.sanitizedSignal)));
});

test('original provenance and redaction-source flags are preserved', () => {
  assert.deepEqual(build().provenance, {
    evidenceKind: 'redacted_real_feedback_samples',
    collectionMethod: 'Redacted internal dogfood feedback export captured from summary review queue.',
    runner: 'scripts/capture-summary-feedback-samples.ts',
    fixtureOnly: false,
  });
});

test('generatedAt samples one minute before invocation clock', () => {
  const before = Date.now(), x = build(), after = Date.now();
  assert.ok(Date.parse(x.generatedAt) >= before - 60_000);
  assert.ok(Date.parse(x.generatedAt) <= after - 60_000);
});

test('source timeline preserves original export lag and 26-hour lookback', () => {
  const x = build();
  const generated = Date.parse(x.generatedAt);
  assert.equal(generated - Date.parse(x.source.export.exportedAt), 30_000);
  assert.equal(generated - Date.parse(x.source.sampleWindow.endedAt), 60_000);
  assert.equal(Date.parse(x.source.sampleWindow.endedAt) - Date.parse(x.source.sampleWindow.startedAt),
    26 * 60 * 60_000 - 2 * 60_000);
});

test('dogfood source identity, reviewers, and export audit identifiers stay exact', () => {
  const src = build().source;
  assert.deepEqual([src.kind, src.environmentId, src.operator, src.redactedBy, src.approvedBy],
    ['internal_dogfood', 'summary-dogfood-alpha-1', 'summary-owner-1', 'summary-owner-1', 'security-owner-1']);
  assert.deepEqual([src.export.sourceSystem, src.export.exportId, src.export.reviewQueue,
    src.export.redactionReviewId, src.export.approvalReference],
    ['summary-feedback-api', 'SF-EXPORT-20260618-ALPHA', 'summary-quality-review',
      'SEC-REDACTION-4321', 'REL-APPROVAL-9876']);
});

test('all original secret and raw-text redaction requirements remain false', () => {
  const r = build().redaction;
  for (const key of ['rawProviderPayloadsIncluded', 'piiIncluded', 'rawPromptTextIncluded',
    'rawSourceTextIncluded', 'tokenValuesIncluded', 'secretUrlsIncluded']) {
    assert.equal(r[key], false, key);
  }
  assert.equal(r.method, 'Identifiers and free-text comments were irreversibly redacted before release review.');
});

test('rollup blocker IDs are regenerated with replaced sample identifiers', () => {
  const x = build();
  assert.deepEqual(x.rollup.blockerSampleIds, ids.slice(0, 2));
  assert.equal(x.source.sampleCount, x.samples.length);
  assert.equal(x.rollup.sampleCount, 3);
});

test('rollup counters and per-sample hardening actions stay unchanged', () => {
  const x = build();
  for (const key of ['categoryCounts', 'classificationCounts', 'severityCounts', 'actionTypeCounts']) {
    assert.deepEqual(x.rollup[key], original.rollup[key], key);
  }
  assert.deepEqual(x.samples.map(y => y.hardeningAction), original.samples.map(y => y.hardeningAction));
});

test('helper mutates the caller-owned fresh document, not any shared fixture instance', () => {
  const input = fixture(), x = build(input);
  assert.equal(x, input);
  assert.notEqual(x, original);
  assert.notEqual(original.samples[0].feedbackId, ids[0]);
});

test('mutating one result cannot affect subsequent invocations or tracked fixture', () => {
  const before = fixture(), x = build();
  x.samples[0].feedbackId = 'mutated';
  x.rollup.blockerSampleIds[0] = 'mutated';
  const y = build();
  assert.equal(y.samples[0].feedbackId, ids[0]);
  assert.deepEqual(y.rollup.blockerSampleIds, ids.slice(0, 2));
  assert.deepEqual(original, before);
});

test('additional sample uses unchanged first-entry replacement fallback', () => {
  const doc = fixture();
  doc.samples.push(globalThis.structuredClone(doc.samples[0]));
  const x = build(doc);
  assert.equal(x.samples[3].feedbackId, ids[0]);
  assert.equal(x.source.sampleCount, 4);
});

test('empty sample list retains empty blockers and zero source count', () => {
  const doc = fixture(); doc.samples = [];
  const x = build(doc);
  assert.deepEqual(x.rollup.blockerSampleIds, []);
  assert.equal(x.source.sampleCount, 0);
});

test('malformed sample list fails closed rather than producing fabricated evidence', () => {
  const doc = fixture(); doc.samples = null;
  assert.throws(() => build(doc), TypeError);
});
