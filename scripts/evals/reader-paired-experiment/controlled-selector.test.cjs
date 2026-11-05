'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { controlledFixture } = require('./controlled-fixture.cjs');
const { evaluationView } = require('./controlled-evaluation-view.cjs');
const { fullSelector } = require('./revision-full-selector.cjs');
const { FINAL, OLD, digest } = require('./revision-source.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
const run = (f, extra = {}) => fullSelector({ revision: FINAL, mode: 'CONTROLLED', evaluation: f.view(),
  modelControls: f.controls.model, responseTapes: [f.tape], ...extra });

test('evaluation clock changes without rewriting any original observation timestamp', () => {
  const f = controlledFixture(), original = clone(f.observation);
  f.controls.clock = '2026-09-09T12:00:00.000Z';
  f.controls.snapshot.query.observedThrough = f.controls.clock;
  f.controls.selection.query.observedThrough = f.controls.clock;
  const view = f.view();
  assert.equal(view.evaluationClock, f.controls.clock);
  assert.deepEqual(view.observation, original);
  assert.notEqual(view.observation.observationQuery.observedThrough, view.evaluationClock);
  assert.throws(() => evaluationView(f.observation, { ...f.controls, locale: 'fr' }, f.declare()), /undeclared_evaluation_intervention/);
});

test('query present keys, clock, scoped interests and original-control bindings fail closed', () => {
  for (const mutate of [
    f => { f.controls.snapshot.presentKeys.pop(); },
    f => { f.controls.selection.query.observedThrough = '2026-09-04T00:00:00.000Z'; },
    f => { f.controls.snapshot.query.interestId = 'different'; },
    f => { f.controls.interests = []; },
    f => { f.controls.interests[0].result.interest.workspaceId = 'different'; },
  ]) {
    const f = controlledFixture(); mutate(f);
    assert.throws(() => f.view());
  }
  const f = controlledFixture(), declaration = f.declare();
  f.observation.interests[0].result.interest.query += ' changed';
  assert.throws(() => evaluationView(f.observation, f.controls, declaration), /undeclared_evaluation_intervention/);
});

test('nonzero observed successes pass real controlled parsers while retaining duration and unverified synthetic origin', async () => {
  const f = controlledFixture();
  for (const row of f.tape.files['models.jsonl']) if (row.event.kind === 'envelope_verified') row.atMs += 50;
  const result = await run(f);
  assert.equal(result.selectorReturned, true);
  assert.equal(result.rows.length, 16);
  assert.equal(result.inventory.supplemental.length, 12);
  assert.equal(result.replay.consumed.length, 2);
  assert.equal(result.replay.delivery.length, 2);
  assert.ok(result.replay.delivery.every(d => d.controlledElapsedMs === 0 && d.originalTerminalAtMs - d.originalStartAtMs === 50));
  assert.equal(result.quiescence.settled, true);
  assert.equal(result.preparationAudit.status, 'controlled_actual_stage_inventory');
  assert.equal(result.preparationAudit.historicalCallbackEqualityVerified, false);
  assert.ok(result.gaps.some(g => g.kind === 'producer_origin_unverified'));
  assert.equal(result.controlledExperimentComplete, false);
  assert.equal(result.historicalTimingVerified, false);
  assert.equal(result.historicalReplayComplete, false);
  assert.equal(result.actualProducerVerified, false);
  assert.equal(result.rows.find(r => r.candidateId === 'abstain').status, 'model_abstained');
  assert.equal(result.rows.find(r => r.candidateId === 'hard-gate').status, 'deterministic_hard_gate');
  const repeated = await run(f);
  assert.equal(digest(repeated), digest(result));
  const unobserved = await run(f, { observe: false });
  assert.deepEqual(unobserved.selection, result.selection);
  assert.deepEqual(unobserved.replay.consumed, result.replay.consumed);
  const historical = await fullSelector({ revision: FINAL, tape: f.tape, modelControls: f.controls.model });
  assert.ok(historical.gaps.some(g => g.kind === 'precise_timing_replay_required'));
});

test('controlled OLD retains its deterministic quality and missing union stays sticky', async () => {
  const f = controlledFixture(), result = await run(f, { revision: OLD });
  assert.ok(result.rows.every(r => r.status === 'deterministic_legacy'));
  assert.equal(result.assessmentRequests.length, 0);
  assert.ok(result.gaps.some(g => g.kind === 'missing_relation_request'));
  assert.equal(result.controlledExperimentComplete, false);
});

test('failed, pending, aborted, malformed and mismatched exact commands cannot certify controlled success', async () => {
  for (const mutate of [
    f => { f.tape.files['models.jsonl'] = f.tape.files['models.jsonl'].filter(r => r.event.kind !== 'envelope_verified'); },
    f => { f.tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event.kind = 'invocation_failed'; },
    f => { f.tape.files['assessments.jsonl'].find(r => r.event.phase === 'completed').event.consumed = false; },
    f => { f.tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event.result.structuredOutput = {}; },
    f => { f.tape.files['models.jsonl'].find(r => r.event.kind === 'invocation_started').event.command.timeoutMs--; },
    f => { f.tape.files['models.jsonl'].find(r => r.event.kind === 'invocation_started').event.command.prompt += 'wrong'; },
    f => { f.tape.files['models.jsonl'].find(r => r.event.kind === 'invocation_started').event.command.outputSchema = {}; },
    f => { f.tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event.result.executionAttestation.selectedOutputSha256 = '0'.repeat(64); },
    f => { f.tape.files['models.jsonl'].find(r => r.event.kind === 'envelope_verified').event.result.executionAttestation.canonicalRequestSha256 = '0'.repeat(64); },
  ]) {
    const f = controlledFixture(); mutate(f); const result = await run(f);
    assert.equal(result.controlledExperimentComplete, false);
    assert.ok(result.gaps.some(g => /missing_|replay_failed|command_mismatch/.test(g.kind)), JSON.stringify(result.gaps));
    assert.equal(result.rows.length, 16);
  }
});
