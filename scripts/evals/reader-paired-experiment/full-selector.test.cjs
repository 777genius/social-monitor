'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OLD, FINAL, digest, sha, revisionSource } = require('./revision-source.cjs');
const { capture, clone } = require('./recorded-selector-ports.cjs');
const { fullSelector } = require('./revision-full-selector.cjs');
const { syntheticTape, writeTape, modelControls } = require('./full-selector-fixture.cjs');
const run = (tape, revision = FINAL, extra = {}) => fullSelector({ tape, revision, modelControls, ...extra });
const kinds = r => r.gaps.map(g => g.kind);
let baseline;
test('actual FINAL rank, parser, two grouping calls and complete raw supplemental inventory', async () => {
  const tape = syntheticTape();
  baseline = await run(tape);
  assert.equal(baseline.selectorReturned, true);
  assert.equal(baseline.rows.length, 16);
  assert.equal(baseline.inventory.primary.length, 4);
  assert.equal(baseline.inventory.supplemental.length, 12);
  assert.equal(baseline.groupingCalls.length, 2);
  assert.equal(baseline.replay.consumed.length, 2);
  assert.equal(baseline.replay.replayMissingRequestCount, 0);
  assert.deepEqual(baseline.assessmentCoverage.pendingIds, ['abstain']);
  assert.equal(baseline.rows.find(r => r.candidateId === 'promote').status, 'model_resolved');
  assert.equal(baseline.rows.find(r => r.candidateId === 'abstain').status, 'model_abstained');
  assert.equal(baseline.rows.find(r => r.candidateId === 'hard-gate').status, 'deterministic_hard_gate');
  assert.equal(baseline.rows.filter(r => r.status === 'deterministic_exempt').length, 12);
  assert.ok(baseline.inventory.supplemental.length > baseline.admitted.selectedEvidence.filter(i => baseline.inventory.supplemental.some(s => s.feedItemId === i.feedItemId)).length);
  assert.ok(baseline.source.closure['libs/relevance/features/rank-feed-items/rank-promotion-snapshot.ts']);
  assert.ok(baseline.source.closure['libs/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter.ts']);
  assert.ok(Object.keys(baseline.source.parserDependencies).some(k => k.startsWith('zod/')));
  assert.equal(baseline.complete, false);
  assert.equal(baseline.actualProducerVerified, false);
  assert.equal(baseline.historicalTimingVerified, false);
  assert.ok(kinds(baseline).includes('producer_origin_unverified'));
});
test('repeat execution is identical; grouping observer preserves returned values and port order', async () => {
  const repeated = await run(syntheticTape());
  assert.equal(digest(repeated), digest(baseline));
  const unobserved = await run(syntheticTape(), FINAL, { observe: false });
  assert.deepEqual(unobserved.selection, baseline.selection);
  assert.deepEqual(unobserved.native, baseline.native);
  assert.deepEqual(unobserved.portCalls, baseline.portCalls);
  assert.deepEqual(unobserved.replay.consumed, baseline.replay.consumed);
});
test('OLD executes deterministic assessment without interest/reviewer calls; differing union request is sticky', async () => {
  const old = await run(syntheticTape(), OLD);
  assert.equal(old.selectorReturned, true);
  assert.equal(old.rows.length, 16);
  assert.ok(old.rows.every(r => r.status === 'deterministic_legacy'));
  assert.equal(old.assessmentRequests.length, 0);
  assert.ok(old.portCalls.every(c => c.port === 'snapshot'));
  assert.equal(old.replay.consumed.length, 0);
  assert.ok(old.replay.replayMissingRequestCount > 0);
  assert.ok(kinds(old).includes('missing_relation_request'));
  assert.notDeepEqual(old.inventory.primary[0].contentQuality, baseline.inventory.primary[0].contentQuality);
  assert.ok(!old.source.closure['libs/relevance/adapters/model/agent-runtime-source-content-quality-reviewer.adapter.ts']);
});
test('missing model response poisons completion even when actual selector catches and returns', async () => {
  const tape = syntheticTape(); tape.files['models.jsonl'] = [];
  const result = await run(tape);
  assert.equal(result.selectorReturned, true);
  assert.equal(result.assessmentCoverage.attemptedCount, 3);
  assert.ok(kinds(result).includes('missing_assessment_request'));
  assert.equal(result.assessmentCoverage.unresolvedCandidateCount, 3);
  assert.ok(result.rows.filter(r => r.requested).every(r => r.status === 'pending'));
});
test('source body, interest, wire command and attested output changes cannot reuse a result', async () => {
  for (const mutate of [
    tape => { tape.files['inputs.json'].snapshot.sourceContent[0].body += ' Changed source'; },
    tape => { tape.files['interests.jsonl'][0].event.result.interest.query += ' changed interest'; },
    tape => { for (const row of tape.files['models.jsonl']) if (row.event.command?.purpose.includes('assess_source')) row.event.command.systemPrompt += ' changed'; },
    tape => { const end = tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified'); end.event.result.structuredOutput.reviews[0].qualityScore = 0.1; },
  ]) {
    const tape = syntheticTape(); mutate(tape);
    const result = await run(tape);
    assert.ok(result.gaps.some(g => /missing_(assessment_request|model_command)|assessment_replay_failed/.test(g.kind)), JSON.stringify(kinds(result)));
    assert.equal(result.complete, false);
  }
});
test('nonzero elapsed and recorded deadlines stay named timing gaps, never instant successful replays', async () => {
  const tape = syntheticTape();
  const end = tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified');
  end.atMs += 300000;
  const result = await run(tape);
  assert.ok(kinds(result).includes('precise_timing_replay_required'));
  assert.ok(!kinds(result).includes('missing_assessment_request'));
  // Pending assessment changes downstream grouping: that newly discovered
  // relation request must remain in the sticky union ledger.
  assert.ok(kinds(result).includes('missing_relation_request'));
  assert.equal(result.assessmentCoverage.unresolvedCandidateCount, 3);
  assert.equal(result.replay.observedOutcomes[0].terminalAtMs - result.replay.observedOutcomes[0].startAtMs, 300000);
  assert.equal(result.historicalTimingVerified, false);
});
test('duplicate partitions, missing source joins, invalid dates and altered query keys fail before selection', async () => {
  for (const mutate of [
    tape => { tape.files['inputs.json'].snapshot.supplementalItems[0].id = 'promote'; },
    tape => { tape.files['inputs.json'].snapshot.sourceContent.pop(); },
    tape => { tape.files['inputs.json'].snapshot.candidates[0].item.publishedAt = '2026-02-31T00:00:00.000Z'; },
    tape => { tape.files['inputs.json'].snapshot.candidates[0].item.publishedAt = '2026-09-02T12:00:00.000Z'; },
    tape => { tape.files['snapshot-query.json'].presentKeys = tape.files['snapshot-query.json'].presentKeys.filter(k => k !== 'interestId'); },
  ]) {
    const tape = syntheticTape(); mutate(tape);
    const result = await run(tape);
    assert.equal(result.selectorReturned, false);
    assert.equal(result.assessmentCoverage.unresolvedCandidateCount, null);
  }
});
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
test('concrete tape reader hashes every sidecar and rejects tampering and journal collisions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-tape-test-'));
  try {
    const ref = writeTape(path.join(dir, 'capture'));
    const loaded = capture(ref); assert.equal(loaded.files['inputs.json'].primaryIds.length, 4);
    fs.appendFileSync(path.join(dir, 'capture', 'inputs.json'), ' ');
    assert.throws(() => capture(ref), /capture_size_or_type/);
    const duplicate = syntheticTape(); duplicate.files['models.jsonl'][0].sequence = duplicate.files['interests.jsonl'][0].sequence;
    const bad = writeTape(path.join(dir, 'collision'), duplicate);
    assert.throws(() => capture(bad), /invalid_journal_sequence/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('revision loader denies live dependencies and never resolves source from cwd', () => {
  const source = revisionSource(process.cwd(), FINAL, '2026-09-05T21:59:00.000Z');
  assert.throws(() => source.load('libs/summary/adapters/model/agent-runtime-model-support.ts'), /external dependency forbidden/);
  assert.throws(() => revisionSource(process.cwd(), 'HEAD', '2026-09-05T21:59:00.000Z'), /unapproved revision/);
  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/p2-synthetic-capture.json'));
  assert.equal(sha(bytes).length, 64);
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
test('canonical request mismatch remains sticky when real assessment code catches it', async () => {
  const tape = syntheticTape();
  const end = tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event;
  end.result.executionAttestation.canonicalRequestSha256 = '0'.repeat(64);
  const result = await run(tape);
  assert.equal(result.selectorReturned, true);
  assert.ok(kinds(result).includes('canonical_runtime_request_invalid'));
  assert.ok(result.rows.filter(r => r.requested).every(r => r.status === 'pending'));
  assert.equal(result.actualProducerVerified, false);
});
test('empty and duplicate producer verdict rows cannot certify complete assessment coverage', async () => {
  for (const duplicate of [false, true]) {
    const tape = syntheticTape();
    const terminal = tape.files['assessments.jsonl'].find(r => r.event.phase === 'completed').event;
    const rows = JSON.parse(terminal.verdictsJson);
    terminal.verdictsJson = JSON.stringify(duplicate ? [rows[0], rows[0], rows[2]] : []);
    const result = await run(tape);
    assert.equal(result.selectorReturned, true);
    assert.ok(kinds(result).includes('assessment_verdict_replay_mismatch'));
  }
});

test('same-millisecond abort and unconsumed deadline outcomes remain recorded timing gaps', async () => {
  for (const kind of ['invocation_aborted', 'envelope_not_consumed']) {
    const tape = syntheticTape(), models = tape.files['models.jsonl'];
    const start = models.find(r => r.event.kind === 'invocation_started');
    const event = kind === 'invocation_aborted'
      ? { kind, requestId: start.event.command.requestId }
      : { kind, command: clone(start.event.command), selectionOutcome: 'not_consumed', reason: 'deadline' };
    models.push({ sequence: 1000, atMs: start.atMs, event });
    const result = await run(tape);
    assert.ok(kinds(result).includes('precise_timing_replay_required'));
    assert.ok(result.rows.filter(r => r.requested).every(r => r.status === 'pending'));
    const observed = result.replay.observedOutcomes[0];
    assert.equal(observed.terminalAtMs, observed.startAtMs);
    assert.deepEqual(observed.modelEvents.find(r => r.event.kind === kind), models.at(-1));
    assert.equal(result.historicalTimingVerified, false);
  }
});

test('response union cannot hide conflicting verdicts or aborts behind an identical envelope', async () => {
  for (const change of ['verdict', 'abort']) {
    const tape = syntheticTape(), conflict = clone(tape);
    conflict.sealSha256 = 'f'.repeat(64);
    if (change === 'verdict') {
      const terminal = conflict.files['assessments.jsonl'].find(r => r.event.phase === 'completed');
      terminal.event.verdictsJson = '[]';
    } else {
      const models = conflict.files['models.jsonl'];
      const start = models.find(r => r.event.kind === 'invocation_started');
      models.push({ sequence: 1000, atMs: start.atMs,
        event: { kind: 'invocation_aborted', requestId: start.event.command.requestId } });
    }
    for (const responseTapes of [[tape, conflict], [conflict, tape]]) {
      const result = await run(tape, FINAL, { responseTapes });
      assert.equal(result.selectorReturned, true);
      assert.ok(kinds(result).includes('ambiguous_recorded_request'));
      assert.ok(result.rows.filter(r => r.requested).every(r => r.status === 'pending'));
      assert.equal(result.complete, false);
    }
  }
});

test('duplicate producer callback identities fail before selecting any first terminal', async () => {
  for (const [file, matches, code] of [
    ['models.jsonl', e => e.kind === 'invocation_started', 'duplicate_model_start'],
    ['assessments.jsonl', e => e.phase === 'attempt', 'duplicate_assessment_attempt'],
    ['assessments.jsonl', e => e.phase === 'completed', 'duplicate_assessment_terminal'],
    ['relations.jsonl', e => e.phase === 'attempt', 'duplicate_relation_attempt'],
    ['relations.jsonl', e => e.phase === 'terminal', 'duplicate_relation_terminal'],
  ]) {
    const tape = syntheticTape(), rows = tape.files[file];
    rows.push({ ...clone(rows.find(r => matches(r.event))), sequence: 1000 });
    const result = await run(tape);
    assert.equal(result.selectorReturned, false);
    assert.equal(result.rows, null);
    assert.ok(result.gaps.some(g => g.kind === 'full_selector_failed' && g.request.code === code));
  }
});
test('actual oversized assessment requests retain budget-pending rows without model attempts', async () => {
  const tape = syntheticTape();
  tape.files['interests.jsonl'][0].event.result.interest.query = 'technical evidence '.repeat(4000);
  const result = await run(tape);
  assert.equal(result.selectorReturned, true);
  assert.equal(result.assessmentCoverage.requestedCount, 3);
  assert.equal(result.assessmentCoverage.attemptedCount, 0);
  assert.ok(result.assessmentRequests.every(r => Buffer.byteLength(JSON.stringify(r)) + 3 > 64000));
  assert.ok(result.rows.filter(r => r.requested).every(r => r.status === 'pending' &&
    r.quality.reason === 'promotion_assessment_pending:budget_exhausted'));
  assert.equal(result.rows.length, 16);
  assert.equal(result.complete, false);
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
test('actual request preparation distinguishes title-only and truncated full source bodies', async () => {
  for (const [body, availability] of [['', 'title_only'], ['Technical implementation details. '.repeat(500), 'truncated']]) {
    const tape = syntheticTape();
    tape.files['inputs.json'].snapshot.sourceContent.find(c => c.feedItemId === 'promote').body = body;
    const result = await run(tape);
    assert.equal(result.selectorReturned, true);
    const request = result.assessmentRequests.find(r => r.candidateId === 'promote');
    assert.ok(request);
    assert.equal(request.promotion.availability, availability);
    assert.equal(request.bodyPreview.length, body ? 12000 : 0);
    assert.equal(result.rows.length, 16);
    assert.equal(result.rows.find(r => r.candidateId === 'promote').status, 'pending');
    assert.ok(kinds(result).includes('missing_assessment_request'));
    assert.equal(result.complete, false);
  }
});

test('raw partition order remains independent of real ranked and selected order', async () => {
  const tape = syntheticTape(), input = tape.files['inputs.json'];
  input.snapshot.candidates.reverse(); input.primaryIds.reverse();
  input.snapshot.supplementalItems.reverse(); input.supplementalIds.reverse();
  input.snapshot.sourceContent.reverse();
  const result = await run(tape);
  assert.equal(result.selectorReturned, true);
  assert.deepEqual(result.rows.map(r => r.candidateId), [...input.primaryIds, ...input.supplementalIds]);
  assert.deepEqual(result.inventory.primary.map(r => r.feedItemId), input.primaryIds);
  assert.deepEqual(result.inventory.supplemental.map(r => r.feedItemId), input.supplementalIds);
  assert.deepEqual(result.rows.filter(r => r.partition === 'primary').map(r => r.rawIndex), [0, 1, 2, 3]);
  assert.deepEqual(result.inventory.rankingOrder, baseline.inventory.rankingOrder);
  assert.deepEqual(result.selection, baseline.selection);
});
test('rehashed malformed, duplicate and missing response rows cannot resolve the actual batch', async () => {
  const source = revisionSource(process.cwd(), FINAL, '2026-09-05T21:59:00.000Z');
  const hash = source.load('libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts').canonicalJsonSha256;
  for (const mutate of [
    reviews => { reviews[0].confidence = 'high'; },
    reviews => { reviews.push(clone(reviews[0])); },
    reviews => { reviews.splice(0); },
    reviews => { reviews[0].candidateId = 'different-source'; },
  ]) {
    const tape = syntheticTape();
    const envelope = tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event.result;
    mutate(envelope.structuredOutput.reviews);
    envelope.executionAttestation.selectedOutputSha256 = source.invoke(hash, [envelope.structuredOutput]);
    const result = await run(tape);
    assert.equal(result.selectorReturned, true);
    assert.ok(kinds(result).includes('assessment_replay_failed'));
    assert.equal(result.assessmentCoverage.unresolvedCandidateCount, 3);
    assert.ok(result.rows.filter(r => r.requested).every(r => r.status === 'pending'));
    assert.equal(result.actualProducerVerified, false);
  }
});
