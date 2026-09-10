'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { syntheticTape } = require('./full-selector-fixture.cjs');
const { setup, rebind, trustedFixture, clone } = require('./review-fixes-fixture.cjs');
const { fullSelector } = require('./revision-full-selector.cjs');
for (const kind of ['missing', 'duplicate', 'unmatched', 'negative']) {
  test(`P1: actual FINAL full selector retains ${kind} reconciliation outcome after successful bound parser`, async () => {
    const builder = setup([syntheticTape()]);
    let fixture;
    try {
      fixture = trustedFixture(tape => {
        const terminal = tape.files['relations.jsonl'].find(r => r.event.phase === 'terminal');
        const original = terminal.event.outcome.decisions[0];
        const decisions = kind === 'missing' ? [] : kind === 'duplicate' ? [original, clone(original)]
          : kind === 'unmatched' ? [{ ...original, rightFeedItemId: 'unmatched-item' }] : [original];
        terminal.event.outcome.decisions = clone(decisions);
        const envelope = tape.files['models.jsonl'].filter(r => r.event.result).at(-1).event;
        envelope.result.structuredOutput = { decisions };
        rebind(builder.source, envelope);
      });
      const result = await fullSelector(fixture.args);
      assert.equal(result.selectorReturned, true, JSON.stringify(result.gaps));
      assert.equal(result.replay.consumed.length, 2);
      assert.ok(result.replay.consumed.every(r => r.admission && r.ownerReceiptSha256));
      assert.equal(result.quiescence.settled, true);
      assert.ok(!result.gaps.some(g => /parser|origin|command/.test(g.kind)), JSON.stringify(result.gaps));
      assert.equal(result.controlledExperimentComplete, kind === 'negative');
      assert.equal(result.actualProducerVerified, kind === 'negative');
      if (kind !== 'negative') assert.ok(result.gaps.some(g => g.kind === 'relation_reconciliation_failed' &&
        g.request.lane === 'foreground'));
      else assert.deepEqual(result.gaps, []);
      assert.equal(result.selection.approvedSameStoryRelations.length, 0);
    } finally { builder.host.close(); fixture?.cleanup(); }
  });
}

for (const lane of ['related_topic', 'safe_recall_shadow']) {
  test(`P1: actual ${lane} source terminal metrics survive successful parsing and later success`, async () => {
    const tape = syntheticTape(), s = setup([tape]);
    try {
      const raw = clone(tape.files['relations.jsonl'][0].event.query);
      const hydrate = value => Array.isArray(value) ? value.map(hydrate) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
          ['publishedAt', 'observedAt', 'requestedAt', 'startedAt', 'endedAt'].includes(key) && typeof item === 'string'
            ? new Date(item) : hydrate(item)])) : value;
      const query = hydrate(raw), candidate = { ...query.candidates[0],
        shadowReasonCode: 'title_normalized_entity_event_evidence',
        subjectFeedItemId: query.candidates[0].leftFeedItemId,
        officialAnchorFeedItemId: query.candidates[0].rightFeedItemId,
        subjectStoryClusterId: query.candidates[0].leftClusterId,
        targetStoryClusterId: query.candidates[0].rightClusterId };
      // Fixture the candidate-generation seam only. The adapter, schema parser,
      // reconciliation, terminal metrics, detached scheduling and drain are real.
      s.source.load('libs/summary/domain/services/story-relation-safe-recall-shadow.ts')
        .buildStoryRelationSafeRecallShadowCandidates = () => ({ candidates: [candidate], aggregates: [] });
      s.source.load('libs/summary/domain/services/reader-summary-related-topics.ts')
        .buildRelatedTopicCandidates = () => [candidate];
      const metrics = require('./relation-completion-ledger.cjs').relationCompletionMetrics(s.source, s.gaps);
      const outcomes = [], method = lane === 'related_topic'
        ? 'recordRelatedTopicVerification' : 'recordStoryRelationSafeRecallShadowDecisions';
      const record = metrics[method];
      metrics[method] = value => { outcomes.push(clone(value)); record(value); };
      const Adapter = s.source.load('libs/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter.ts')
        .AgentRuntimeReaderSummaryStoryRelationVerifier;
      let decisions, parserError, parsed = 0;
      const adapter = new Adapter({ client: { async runTask(command) {
        const result = clone(tape.files['models.jsonl'].filter(r => r.event.result).at(-1).event.result);
        result.structuredOutput = { decisions };
        result.executionAttestation.purpose = command.purpose;
        rebind(s.source, { command, result });
        require('./recorded-request-admission.cjs').verifyRecordedRequestAdmission(s.source, command, result);
        return result;
      } } });
      const verifier = { verify(input) { return s.host.track(`relation:${lane}:parser`, async () => {
        try { const result = await adapter.verify(input); parsed++; return result; }
        catch (error) { parserError = error.stack; throw error; }
      }); } };
      const selection = { clusters: query.clusters, selectedEvidence: query.evidence, rankingPolicyVersion: 'fixture-ranking' };
      const params = { query, evidence: query.evidence, deterministicSelection: selection, selection,
        requestedAt: query.requestedAt, verifier, metrics, authoritativeCandidates: [] };
      const run = async () => {
        if (lane === 'safe_recall_shadow') {
          const schedule = s.source.load('libs/summary/adapters/evidence/relevance-reader-summary-story-relation-decisions.ts')
            .scheduleReaderSummarySafeRecallShadowObservation;
          s.source.invoke(schedule, [params]);
          await s.host.run(Promise.resolve('selector-returned'), { requireQuiescence: true });
        } else {
          const verify = s.source.load('libs/summary/adapters/evidence/relevance-reader-summary-related-topics.ts')
            .verifiedReaderSummaryRelatedTopics;
          assert.deepEqual(clone(await s.host.run(s.source.invoke(verify, [params]), { requireQuiescence: true })), []);
        }
      };
      const negative = { leftFeedItemId: candidate.leftFeedItemId, rightFeedItemId: candidate.rightFeedItemId,
        ...(lane === 'related_topic' ? { relation: 'unrelated' } : { sameStory: false }), confidenceScore: 0.99, rationale: 'Synthetic unrelated subjects' };
      decisions = [negative];
      try { await run(); } catch (error) { assert.fail(`${error.message}: ${parserError}: ${JSON.stringify(s.host.quiescence())}`); }
      assert.equal(parsed, 1); assert.deepEqual(s.gaps.entries(), []);
      for (const invalid of [[], [negative, clone(negative)], [{ ...negative, rightFeedItemId: 'unmatched' }]]) {
        const before = parsed;
        decisions = invalid; await run();
        assert.equal(parsed, before + 1, 'actual schema parser must succeed before reconciliation rejects');
        if (lane === 'related_topic') assert.equal(outcomes.at(-1).status, 'failed_closed');
        else assert.ok(outcomes.at(-1).every(row => row.disposition === 'verifier_failed_closed'));
        assert.ok(s.gaps.entries().some(g => g.kind === 'relation_reconciliation_failed' && g.request.lane === lane));
        const sticky = clone(s.gaps.entries());
        decisions = [negative]; await run();
        if (lane === 'related_topic') assert.equal(outcomes.at(-1).status, 'completed');
        else assert.ok(outcomes.at(-1).every(row => row.disposition === 'rejected_same_story_false'));
        assert.deepEqual(s.gaps.entries(), sticky);
      }
      assert.equal(s.host.quiescence().settled, true);
    } finally { s.host.close(); }
  });
}
