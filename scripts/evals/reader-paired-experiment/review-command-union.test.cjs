'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { syntheticTape } = require('./full-selector-fixture.cjs');
const { setup, rebind, trustedFixture, clone } = require('./review-fixes-fixture.cjs');
function assessment(tape) {
  return tape.files['models.jsonl'].filter(r => r.event.command?.purpose.includes('assess_source_content'));
}
test('P2: artificial-owner contract union selects complete generated timeout command and preserves both original histories', async () => {
  const builder = setup([syntheticTape()]), fixtures = [];
  try {
    for (const timeout of [300000, 299999]) fixtures.push(trustedFixture(tape => {
      const oldId = assessment(tape)[0].event.command.requestId;
      for (const row of tape.files['models.jsonl']) if (row.event.requestId === oldId)
        row.event.requestId = `source-content-assessment:timeout-${timeout}`;
      for (const row of assessment(tape)) {
        row.event.command.timeoutMs = timeout;
        row.event.command.requestId = `source-content-assessment:timeout-${timeout}`;
        row.event.command.correlationId = row.event.command.requestId;
        if (row.event.result) rebind(builder.source, row.event);
      }
    }));
    const tapes = fixtures.map(f => f.admitted.tape), originals = clone(tapes);
    for (const [pool, timeout] of [[tapes.slice(0, 1), 300000], [tapes.slice(1), 299999],
      [tapes, 300000], [tapes, 299999], [[...tapes].reverse(), 300000]]) {
      const s = setup(pool);
      try {
        const reviews = await s.host.run(s.replay.reviewer().reviewBatch(s.requests,
          { signal: new AbortController().signal, timeoutMs: timeout }), { requireQuiescence: true });
        assert.equal(reviews.length, 3);
        assert.deepEqual(s.gaps.entries(), []);
        const report = s.replay.report();
        assert.equal(report.consumed.length, 1);
        assert.equal(report.consumed[0].requestId, `source-content-assessment:timeout-${timeout}`);
        assert.equal(report.captureHistories.length, pool.length);
        assert.equal(report.recordHistory.length, pool.length * 2);
        assert.ok(report.consumed[0].ownerReceiptSha256);
      } finally { s.host.close(); }
    }
    assert.deepEqual(tapes, originals);
  } finally { builder.host.close(); fixtures.forEach(f => f.cleanup()); }
});
test('P2: other prompt/schema/provider/metadata commands cannot poison exact selection; same-command conflicting outputs fail closed', async () => {
  const base = syntheticTape(), builder = setup([base]);
  try {
    const variants = [
      c => { c.systemPrompt += ' other'; c.prompt += ' '; }, c => { c.outputSchema.description = 'other'; },
      c => { c.controls.maxOutputTokens += 1; }, c => { c.metadata.other = 'other'; },
      c => { c.providerInstanceId = 'other'; },
    ].map((mutate, index) => {
      const tape = syntheticTape(); tape.sealSha256 = String(index + 1).repeat(64);
      for (const row of assessment(tape)) { mutate(row.event.command); if (row.event.result) rebind(builder.source, row.event); }
      return tape;
    });
    const s = setup([...variants, base]);
    try {
      await s.host.run(s.replay.reviewer().reviewBatch(s.requests), { requireQuiescence: true });
      assert.equal(s.replay.report().consumed[0].recordId.split(':')[0], base.sealSha256);
      assert.ok(s.gaps.entries().every(g => g.kind === 'producer_origin_unverified'));
      assert.equal(s.replay.report().captureHistories.length, 6);
    } finally { s.host.close(); }
    const missing = setup(variants);
    try {
      await assert.rejects(missing.replay.reviewer().reviewBatch(missing.requests), /missing_model_command/);
      assert.equal(missing.replay.report().consumed.length, 0);
    } finally { missing.host.close(); }
    for (const outputKind of ['outputText', 'structuredOutput']) {
      const conflict = syntheticTape(); conflict.sealSha256 = 'f'.repeat(64);
      const end = assessment(conflict).find(r => r.event.result).event;
      if (outputKind === 'outputText') end.result.outputText = 'conflicting output';
      else {
        end.result.structuredOutput.reviews[0].reason = 'Different synthetic reason';
        const terminal = conflict.files['assessments.jsonl'].find(r => r.event.phase === 'completed').event;
        const reviews = JSON.parse(terminal.reviewsJson);
        reviews[0].reason = end.result.structuredOutput.reviews[0].reason;
        terminal.reviewsJson = JSON.stringify(reviews);
      }
      rebind(builder.source, end);
      const alone = setup([conflict]);
      try {
        assert.equal((await alone.host.run(alone.replay.reviewer().reviewBatch(alone.requests),
          { requireQuiescence: true })).length, 3);
      } finally { alone.host.close(); }
      const failed = setup([base, conflict]);
      try {
        await assert.rejects(failed.replay.reviewer().reviewBatch(failed.requests), /ambiguous_recorded_request/);
        assert.equal(failed.replay.report().consumed.length, 0);
        assert.equal(failed.host.quiescence().settled, false);
        assert.equal(failed.replay.report().captureHistories.length, 2);
      } finally { failed.host.close(); }
    }
  } finally { builder.host.close(); }
});
