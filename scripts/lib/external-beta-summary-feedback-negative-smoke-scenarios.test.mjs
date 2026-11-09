import assert from 'node:assert/strict';
import test from 'node:test';
import { summaryFeedbackNegativeSmokeScenarios } from './external-beta-summary-feedback-negative-smoke-scenarios.mjs';

const contract = [
  ['summary feedback fixture sample id', 'real feedback sample must not reuse fixture sample id'],
  ['summary feedback fixture sample signal text', 'real feedback sample must not copy fixture sample signal text'],
  ['summary feedback fixture provenance', 'must not contain fixture provenance'],
  ['summary feedback non-real source kind', 'real sample source.kind must be one of internal_dogfood, private_beta'],
  ['summary feedback missing source export traceability', 'source.export must be an object'],
  ['summary feedback raw source redaction flag', 'redaction.rawSourceTextIncluded must be false'],
  ['summary feedback missing minimum samples', 'samples must include at least 2 samples'],
  ['summary feedback rollup mismatch', 'rollup.releaseBlockingSamples must match releaseBlocking samples'],
  ['summary feedback forbidden sensitive field', 'forbidden sensitive field "authorization"'],
  ['summary feedback raw duplicate-key credential hidden by JSON parser', 'sensitive literal fragment "bearer "'],
];

const originalComment = 'Reviewer noted that the redacted item showed a pending state while the summary used approved wording.';
function fixture() {
  return {
    samples: [
      { feedbackId: 'real-feedback-1', sanitizedSignal: 'redacted valid feedback', redactedComment: originalComment, summaryEvidence: {} },
      { feedbackId: 'real-feedback-2', sanitizedSignal: 'another redacted feedback', redactedComment: 'another valid comment', summaryEvidence: {} },
    ],
    rollup: { blockerSampleIds: ['real-feedback-1', 'real-feedback-2'], releaseBlockingSamples: 2 },
    provenance: { evidenceKind: 'private_beta', fixtureOnly: false },
    source: { kind: 'private_beta', export: { artifactId: 'redacted-export' }, sampleCount: 2 },
    redaction: { rawSourceTextIncluded: false },
  };
}
function apply(index) {
  const artifact = fixture();
  const scenario = summaryFeedbackNegativeSmokeScenarios()[index];
  scenario.mutateArtifact(artifact);
  return artifact;
}
test('ten independent negative declarations preserve original identity, order and diagnostics', () => {
  const scenarios = summaryFeedbackNegativeSmokeScenarios();
  assert.deepEqual(scenarios.map(({ label, expectedOutput }) => [label, expectedOutput]), contract);
  assert.equal(new Set(scenarios.map(item => item.label)).size, 10);
  assert.notStrictEqual(scenarios, summaryFeedbackNegativeSmokeScenarios());
  assert.equal(scenarios.filter(item => typeof item.mutateArtifact === 'function').length, 9);
});
test('fixture feedback sample identifier also updates its rollup reference', () => {
  const artifact = apply(0);
  assert.equal(artifact.samples[0].feedbackId, 'redacted-feedback-wrong-fact-001');
  assert.equal(artifact.rollup.blockerSampleIds[0], artifact.samples[0].feedbackId);
});
test('fixture feedback sample signal and redacted comment retain exact detection sentinels', () => {
  const artifact = apply(1);
  assert.equal(artifact.samples[0].sanitizedSignal, 'Summary asserted a decision that was not supported by the cited redacted item.');
  assert.equal(artifact.samples[0].redactedComment, 'The cited source only says review is pending, but the summary says it was approved.');
});
test('fixture provenance remains clearly synthetic and fail-closed', () => {
  const artifact = apply(2);
  assert.equal(artifact.provenance.evidenceKind, 'fixture_example');
  assert.equal(artifact.provenance.fixtureOnly, true);
  assert.equal(artifact.provenance.runner, 'ops/release/fixtures/redacted-summary-feedback-samples-examples.json');
});
test('non-real source kind is rejected without altering its export traceability', () => {
  const artifact = apply(3);
  assert.equal(artifact.source.kind, 'example_redacted_dogfood');
  assert.ok(artifact.source.export);
});
test('missing source export traceability stays missing', () => {
  const artifact = apply(4);
  assert.equal(Object.hasOwn(artifact.source, 'export'), false);
});
test('raw source inclusion flag remains unsafe', () => {
  assert.equal(apply(5).redaction.rawSourceTextIncluded, true);
});
test('minimum sample counter and list are both reduced', () => {
  const artifact = apply(6);
  assert.equal(artifact.samples.length, 1);
  assert.equal(artifact.source.sampleCount, 1);
});
test('rollup inconsistency remains a validation failure', () => {
  const artifact = apply(7);
  assert.equal(artifact.rollup.releaseBlockingSamples, 0);
  assert.equal(artifact.samples.length, 2);
});
test('forbidden authorization field is inserted at the original nested evidence path', () => {
  const artifact = apply(8);
  assert.equal(artifact.samples[0].summaryEvidence.authorization, 'redacted-header-name-only');
});
test('raw duplicate credential remains visible to raw scanner before JSON parse', () => {
  const raw = summaryFeedbackNegativeSmokeScenarios()[9].artifactContent(fixture());
  assert.equal((raw.match(/"redactedComment":/g) ?? []).length, 3);
  assert.match(raw, /Bearer raw-summary-feedback-token-hidden-by-duplicate-key/);
  assert.equal(JSON.parse(raw).samples[0].redactedComment, originalComment);
});
