'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { recordedResponses } = require('./recorded-model-responses.cjs');
const { syntheticTape, modelControls } = require('./full-selector-fixture.cjs');
const { revisionSource, FINAL } = require('./revision-source.cjs');
const { replayHost } = require('./replay-host.cjs');
const { ledger, clone } = require('./recorded-selector-ports.cjs');
function setup(tapes) {
  const host = replayHost(), clock = { now: () => new Date('2026-09-05T21:59:00.000Z') };
  const source = revisionSource(process.cwd(), FINAL, clock.now().toISOString(), host), gaps = ledger();
  const replay = recordedResponses(source, tapes, gaps, clock, modelControls, { mode: 'CONTROLLED', host });
  const requests = JSON.parse(tapes[0].files['assessments.jsonl'].find(r => r.event.phase === 'attempt').event.requestsJson);
  const raw = clone(tapes[0].files['relations.jsonl'].find(r => r.event.phase === 'attempt').event.query);
  // Only the typed date fields consumed by the actual relation request builder
  // are hydrated. The original tape remains byte-for-byte unchanged.
  const query = { ...raw, evidence: raw.evidence.map(item => ({ ...item,
    publishedAt: new Date(item.publishedAt), observedAt: new Date(item.observedAt) })), requestedAt: new Date(raw.requestedAt),
    period: { ...raw.period, startedAt: new Date(raw.period.startedAt), endedAt: new Date(raw.period.endedAt) },
    clusters: raw.clusters.map(c => ({ ...c, observedAtRange: {
      startedAt: new Date(c.observedAtRange.startedAt), endedAt: new Date(c.observedAtRange.endedAt) } })) };
  delete query.aborted;
  return { host, source, replay, gaps, requests, query };
}
test('overlapping actual assessment and relation parsers keep separate record and transport identities', async () => {
  const tape = syntheticTape(), s = setup([tape]);
  try {
    const [reviews, decisions] = await s.host.run(Promise.all([
      s.replay.reviewer().reviewBatch(s.requests), s.replay.relation().verify(s.query),
    ]), { requireQuiescence: true });
    assert.equal(reviews.length, 3);
    assert.ok(Array.isArray(decisions));
    const report = s.replay.report();
    assert.equal(report.consumed.length, 2);
    assert.equal(new Set(report.consumed.map(c => c.requestId)).size, 2);
    assert.equal(report.delivery.length, 2);
    assert.equal(s.host.quiescence().settled, true);
    assert.ok(s.gaps.entries().every(g => g.kind === 'producer_origin_unverified'));
  } finally { s.host.close(); }
});
test('pre-aborted relation request never becomes recorded success', async () => {
  const s = setup([syntheticTape()]);
  try {
    await assert.rejects(s.replay.relation().verify({ ...s.query, signal: AbortSignal.abort() }), /relation_request_expired/);
    assert.equal(s.replay.report().consumed.length, 0);
    assert.equal(s.host.quiescence().settled, false);
  } finally { s.host.close(); }
});
test('stable selection allows differing observed durations but retains all original histories', async () => {
  const a = syntheticTape(), b = syntheticTape();
  a.sealSha256 = 'b'.repeat(64); b.sealSha256 = 'a'.repeat(64);
  for (const row of b.files['models.jsonl']) if (row.event.kind === 'envelope_verified') row.atMs += 75;
  const s = setup([a, b]);
  try {
    await s.host.run(s.replay.reviewer().reviewBatch(s.requests), { requireQuiescence: true });
    assert.ok(s.replay.report().consumed[0].recordId.startsWith('a'.repeat(64)));
    assert.equal(s.replay.report().captureHistories.length, 2);
    assert.equal(s.replay.report().delivery[0].originalTerminalAtMs - s.replay.report().delivery[0].originalStartAtMs, 75);
  } finally { s.host.close(); }
});

test('concurrent foreground and safe-recall shadow run actual parsers with isolated original IDs; missing shadow is sticky', async () => {
  const base = syntheticTape(), builder = setup([base]), shadow = syntheticTape();
  try {
    const shadowQuery = { ...builder.query, verificationLane: 'safe_recall_shadow' };
    const Adapter = builder.source.load('libs/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter.ts').AgentRuntimeReaderSummaryStoryRelationVerifier;
    const admit = builder.source.load('apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts').admitSubscriptionRuntimeRequest;
    const hash = builder.source.load('libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts').canonicalJsonSha256;
    let shadowCommand, shadowResult;
    // Synthetic contract fixture generated through the actual command builder.
    // No capture owner is attached and no provider or runtime client is invoked.
    const adapter = new Adapter({ client: { async runTask(command) {
      shadowCommand = clone(command);
      shadowResult = clone(base.files['models.jsonl'].filter(r => r.event.kind === 'envelope_verified').at(-1).event.result);
      shadowResult.executionAttestation.requestId = command.requestId;
      const admitted = builder.source.invoke(admit, [{ ...command, providerInstanceId: undefined, cwd: undefined,
        outputSchemaJson: JSON.stringify(command.outputSchema), controlsJson: JSON.stringify(command.controls), metadata: command.metadata ?? {} }]);
      shadowResult.executionAttestation.canonicalRequestSha256 = builder.source.invoke(hash, [admitted.canonicalRequest]);
      return shadowResult;
    } } });
    const decisions = await adapter.verify(shadowQuery);
    const oldId = base.files['models.jsonl'].filter(r => r.event.kind === 'invocation_started').at(-1).event.command.requestId;
    shadow.files['models.jsonl'] = shadow.files['models.jsonl'].filter(r => r.event.command?.requestId === oldId);
    shadow.files['models.jsonl'].forEach(row => {
      row.event.command = clone(shadowCommand);
      if (row.event.kind === 'envelope_verified') row.event.result = clone(shadowResult);
    });
    shadow.files['relations.jsonl'].forEach(row => {
      if (row.event.phase === 'attempt') row.event.query = clone({ ...shadowQuery, aborted: false });
      else row.event.outcome.decisions = clone(decisions);
    });
    shadow.files['assessments.jsonl'] = [];
    shadow.sealSha256 = 'd'.repeat(64);
    const s = setup([base, shadow]);
    try {
      const verifier = s.replay.relation();
      await s.host.run(Promise.all([verifier.verify(s.query), verifier.verify({ ...s.query, verificationLane: 'safe_recall_shadow' })]), { requireQuiescence: true });
      assert.deepEqual(new Set(s.replay.report().consumed.map(record => record.requestId)), new Set([oldId, shadowCommand.requestId]));
      assert.ok(s.gaps.entries().every(gap => gap.kind === 'producer_origin_unverified'));
      assert.equal(s.host.quiescence().settled, true);
    } finally { s.host.close(); }
    await assert.rejects(builder.replay.relation().verify(shadowQuery), /missing_relation_request/);
    assert.ok(builder.gaps.entries().some(gap => gap.kind === 'missing_relation_request'));
    assert.equal(builder.host.quiescence().settled, false);
  } finally { builder.host.close(); }
});

test('controlled response conflicts fail closed and a separate success never rewrites a failed historical attempt', async () => {
  const a = syntheticTape(), b = syntheticTape(); b.sealSha256 = 'e'.repeat(64);
  const end = b.files['models.jsonl'].find(row => row.event.kind === 'envelope_verified');
  end.event.result.structuredOutput.reviews[0].confidence = 0.81;
  const conflict = setup([a, b]);
  try {
    await assert.rejects(conflict.replay.reviewer().reviewBatch(conflict.requests), /ambiguous_recorded_request/);
    assert.ok(conflict.gaps.entries().some(gap => gap.kind === 'ambiguous_recorded_request'));
  } finally { conflict.host.close(); }
  end.event.kind = 'invocation_failed';
  const success = setup([a, b]);
  try {
    await success.host.run(success.replay.reviewer().reviewBatch(success.requests), { requireQuiescence: true });
    const report = success.replay.report();
    assert.ok(report.consumed[0].recordId.startsWith(a.sealSha256));
    assert.ok(report.captureHistories[1].models.some(row => row.event.kind === 'invocation_failed'));
    assert.equal(end.event.kind, 'invocation_failed');
    assert.ok(success.gaps.entries().some(gap => gap.kind === 'producer_origin_unverified'));
  } finally { success.host.close(); }
});
