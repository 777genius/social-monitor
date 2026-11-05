'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { syntheticTape } = require('./full-selector-fixture.cjs');
const { controlledFixture } = require('./controlled-fixture.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
const { revisionSource, FINAL, digest } = require('./revision-source.cjs');
const { fullSelector } = require('./revision-full-selector.cjs');
const kinds = result => result.gaps.map(g => g.kind);
async function run(tape) {
  const f = controlledFixture();
  f.controls.interests = clone(tape.files['interests.jsonl'].map(row => row.event));
  f.observation.interests = clone(f.controls.interests);
  f.observation.snapshot = clone(tape.files['inputs.json'].snapshot);
  f.observation.observationSha256 = digest(f.observation.snapshot);
  return fullSelector({ revision: FINAL, mode: 'CONTROLLED', evaluation: f.view(),
    modelControls: f.controls.model, responseTapes: [tape] });
}
test('actual 200 candidate attempt bound retains the 201st pending raw row', async () => {
  const tape = syntheticTape(), input = tape.files['inputs.json'];
  const primary = clone(input.snapshot.candidates.find(c => c.item.id === 'promote'));
  const body = clone(input.snapshot.sourceContent.find(c => c.feedItemId === 'promote'));
  input.snapshot.candidates = Array.from({ length: 201 }, (_, i) => {
    const candidate = clone(primary); candidate.item.id = `bound-${String(i).padStart(3, '0')}`;
    candidate.item.sourceItemId = `source-${candidate.item.id}`;
    return candidate;
  });
  input.snapshot.sourceContent = input.snapshot.candidates.map(c => ({ ...body, feedItemId: c.item.id, sourceItemId: c.item.sourceItemId }));
  input.snapshot.supplementalItems = [];
  input.primaryIds = input.snapshot.candidates.map(c => c.item.id); input.supplementalIds = [];
  input.snapshot.physicalRowsRead = 201;
  tape.files['models.jsonl'] = [];
  const result = await run(tape);
  assert.equal(result.selectorReturned, true);
  assert.equal(result.rows.length, 201);
  assert.equal(result.assessmentCoverage.requestedCount, 201);
  assert.equal(result.assessmentCoverage.attemptedCount, 200);
  assert.equal(result.rows.find(r => r.candidateId === 'bound-200').quality.reason, 'promotion_assessment_pending:budget_exhausted');
  assert.equal(result.assessmentCoverage.unresolvedCandidateCount, 201);
});
test('real response parser produces a rejection and detects rehashed binding forgery', async () => {
  const source = revisionSource(process.cwd(), FINAL, '2026-09-05T21:59:00.000Z');
  const parse = source.load('libs/relevance/adapters/model/source-content-quality-review-wire.ts').parseReviews;
  const hash = source.load('libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts').canonicalJsonSha256;
  const tape = syntheticTape();
  const envelope = tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event;
  const review = envelope.result.structuredOutput.reviews.find(r => r.candidateId === 'reject');
  review.decision = 'reject'; review.qualityScore = 0.1;
  envelope.result.executionAttestation.selectedOutputSha256 = source.invoke(hash, [envelope.result.structuredOutput]);
  const terminal = tape.files['assessments.jsonl'].find(r => r.event.phase === 'completed').event;
  terminal.reviewsJson = JSON.stringify(source.invoke(parse, [JSON.stringify(envelope.result.structuredOutput), JSON.parse(terminal.requestsJson)]));
  const result = await run(tape);
  assert.equal(result.rows.find(r => r.candidateId === 'reject').status, 'model_resolved');
  assert.equal(result.rows.find(r => r.candidateId === 'reject').quality.decision, 'reject');
  assert.equal(result.rows.find(r => r.candidateId === 'reject').quality.eligibleForSummary, false);
  // Retained producer verdicts must agree too; this modified synthetic tape has
  // deliberately not updated verdictsJson and is therefore explicitly partial.
  assert.ok(kinds(result).includes('assessment_verdict_replay_mismatch'));
  assert.equal(result.complete, false);
  review.bindingId = 'forged-other-source';
  envelope.result.executionAttestation.selectedOutputSha256 = source.invoke(hash, [envelope.result.structuredOutput]);
  const forged = await run(tape);
  assert.ok(kinds(forged).includes('assessment_replay_failed'));
  assert.equal(forged.rows.find(r => r.candidateId === 'reject').status, 'pending');
});
test('actual total-byte exhaustion stops attempts while retaining every eligible source', async () => {
  const tape = syntheticTape(), input = tape.files['inputs.json'];
  const primary = clone(input.snapshot.candidates.find(c => c.item.id === 'promote'));
  const body = clone(input.snapshot.sourceContent.find(c => c.feedItemId === 'promote'));
  input.snapshot.candidates = Array.from({ length: 30 }, (_, i) => {
    const candidate = clone(primary);
    candidate.item.id = `bytes-${String(i).padStart(2, '0')}`;
    candidate.item.sourceItemId = `source-${candidate.item.id}`;
    return candidate;
  });
  input.snapshot.sourceContent = input.snapshot.candidates.map(c =>
    ({ ...body, feedItemId: c.item.id, sourceItemId: c.item.sourceItemId }));
  input.snapshot.supplementalItems = [];
  input.primaryIds = input.snapshot.candidates.map(c => c.item.id);
  input.supplementalIds = []; input.snapshot.physicalRowsRead = 30;
  tape.files['interests.jsonl'][0].event.result.interest.query = 'technical evidence '.repeat(1600);
  tape.files['models.jsonl'] = [];
  const result = await run(tape);
  assert.equal(result.selectorReturned, true);
  assert.equal(result.rows.length, 30);
  assert.equal(result.assessmentCoverage.requestedCount, 30);
  assert.ok(result.assessmentCoverage.attemptedCount > 0 && result.assessmentCoverage.attemptedCount < 30);
  const batches = result.gaps.filter(g => g.kind === 'missing_assessment_request').map(g => g.request);
  const bytes = batch => 2 + batch.reduce((sum, r) => sum + Buffer.byteLength(JSON.stringify(r)) + 1, 0);
  assert.ok(batches.every(batch => bytes(batch) <= 64000));
  const total = batches.reduce((sum, batch) => sum + bytes(batch), 0);
  const smallest = Math.min(...result.assessmentRequests.map(r => bytes([r])));
  assert.ok(total <= 512000 && total + smallest > 512000);
  assert.equal(batches.flat().length, result.assessmentCoverage.attemptedCount);
  assert.ok(result.rows.filter(r => !r.attempted).every(r =>
    r.quality.reason === 'promotion_assessment_pending:budget_exhausted'));
  assert.equal(result.assessmentCoverage.unresolvedCandidateCount, 30);
});
