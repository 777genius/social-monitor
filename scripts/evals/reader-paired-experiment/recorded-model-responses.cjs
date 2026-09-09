'use strict';
const { clone, same } = require('./recorded-selector-ports.cjs');
const { digest, check } = require('./revision-source.cjs');
const { verifyRecordedRequestAdmission } = require('./recorded-request-admission.cjs');
const ASSESSMENT = 'social_monitor.relevance.assess_source_content.v1';
const semantic = command => {
  const { requestId, correlationId, ...rest } = command;
  void requestId; // Transport identity is excluded only from semantic request comparison.
  void correlationId;
  return clone(rest);
};
function recordedResponses(source, tapes, gaps, clock, controls) {
  const records = [], consumed = [], assessedRecords = [], attemptedIds = new Set(), observations = [];
  for (const tape of tapes) {
    const models = tape.files['models.jsonl'] || [];
    const starts = models.filter(r => r.event.kind === 'invocation_started');
    check(new Set(starts.map(r => r.event.command.requestId)).size === starts.length, 'duplicate_model_start');
    const unique = (name, predicate, code) => {
      const matches = (tape.files[name] || []).filter(predicate);
      check(matches.length <= 1, code);
      return matches[0];
    };
    for (const start of models.filter(r => r.event.kind === 'invocation_started')) {
      const id = start.event.command.requestId;
      const modelEvents = models.filter(r => (r.event.command?.requestId ?? r.event.requestId) === id);
      const terminal = models.filter(r => ['envelope_verified', 'invocation_failed'].includes(r.event.kind) &&
        (r.event.command?.requestId ?? r.event.requestId) === id);
      check(terminal.length <= 1, 'duplicate_model_terminal');
      const assessment = unique('assessments.jsonl', r => r.event.phase === 'attempt' && r.event.batch === start.event.assessmentBatch, 'duplicate_assessment_attempt');
      const assessmentEnd = unique('assessments.jsonl', r => r.event.phase !== 'attempt' && r.event.batch === start.event.assessmentBatch, 'duplicate_assessment_terminal');
      const relation = unique('relations.jsonl', r => r.event.phase === 'attempt' && r.event.id === start.event.relationId, 'duplicate_relation_attempt');
      const relationEnd = unique('relations.jsonl', r => r.event.phase === 'terminal' && r.event.id === start.event.relationId, 'duplicate_relation_terminal');
      records.push({ id: `${tape.sealSha256}:${start.sequence}`, start, modelEvents, terminal: terminal[0], assessment, assessmentEnd, relation, relationEnd });
    }
  }
  let active, generated = 0;
  const exactRecord = (kind, request) => {
    const matches = records.filter(record => kind === 'assessment'
      ? record.assessment && same(JSON.parse(record.assessment.event.requestsJson), clone(request))
      : record.relation && same(record.relation.event.query, clone({ ...request, signal: undefined, aborted: request.signal?.aborted ?? false })));
    if (!matches.length) return gaps.fail(`missing_${kind}_request`, request);
    // Duplicate captures must agree on the complete consumed call and observed
    // outcome. Choosing the first envelope must not hide a conflicting abort,
    // parser result, verdict inventory or completion time in another tape.
    const observation = record => ({
      models: record.modelEvents.map(({ atMs, event }) => ({ atMs, event })),
      assessment: record.assessment, assessmentEnd: record.assessmentEnd,
      relation: record.relation, relationEnd: record.relationEnd,
    });
    if (!matches.every(r => same(observation(r), observation(matches[0]))))
      return gaps.fail('ambiguous_recorded_request', { kind, request });
    return matches[0];
  };
  const client = { runTask: async (command, options) => {
    const record = active;
    if (!record || !same(semantic(command), semantic(record.start.event.command))) gaps.fail('missing_model_command', command);
    // Original transport identity is supplied before the actual adapter builds
    // its command. Attestations are never rewritten for a new request ID.
    if (command.requestId !== record.start.event.command.requestId || command.correlationId !== record.start.event.command.correlationId) gaps.fail('transport_identity_mismatch', command);
    consumed.push({ recordId: record.id, requestId: command.requestId, semanticSha256: digest(semantic(command)) });
    const end = record.terminal;
    observations.push({ recordId: record.id, startAtMs: record.start.atMs, terminalAtMs: end?.atMs ?? null,
      modelOutcome: end?.event.kind ?? 'pending', assessmentOutcome: clone(record.assessmentEnd?.event ?? null),
      relationOutcome: clone(record.relationEnd?.event.outcome ?? null),
      modelEvents: clone(record.modelEvents) });
    const timingSensitive = record.modelEvents.some(r => r.event.kind === 'invocation_aborted' ||
      (r.event.kind === 'envelope_not_consumed' && ['deadline', 'aborted'].includes(r.event.reason))) ||
      record.relationEnd?.event.outcome.aborted || record.relationEnd?.event.outcome.status === 'aborted';
    if (timingSensitive) return gaps.fail('precise_timing_replay_required', { recordId: record.id });
    if (!end) return gaps.fail('recorded_model_still_pending', { recordId: record.id });
    if (end.atMs !== record.start.atMs || record.assessmentEnd?.event.failure === 'deadline' ||
        record.assessmentEnd?.event.failure === 'aborted' || options.signal?.aborted) {
      return gaps.fail('precise_timing_replay_required', { recordId: record.id, startAtMs: record.start.atMs, terminalAtMs: end.atMs });
    }
    if (end.event.kind !== 'envelope_verified') return gaps.fail('recorded_model_failure', { recordId: record.id });
    check(same(end.event.command, record.start.event.command), 'model_terminal_command_mismatch');
    try {
      const admission = verifyRecordedRequestAdmission(source, command, end.event.result);
      consumed[consumed.length - 1].admission = admission;
    } catch (error) {
      return gaps.fail('canonical_runtime_request_invalid', { recordId: record.id, code: error.message });
    }
    gaps.add('producer_origin_unverified', { recordId: record.id });
    return clone(end.event.result);
  } };
  const assessmentFile = 'libs/relevance/adapters/model/agent-runtime-source-content-quality-reviewer.adapter.ts';
  const reviewer = () => {
    const Adapter = source.load(assessmentFile).AgentRuntimeSourceContentQualityReviewerAdapter;
    const adapter = new Adapter({ ...controls.assessment, client, clock,
      ids: { generate() {
        generated++;
        const id = active?.start.event.command.requestId;
        check(id?.startsWith('source-content-assessment:'), 'assessment_transport_id_missing');
        return id.slice('source-content-assessment:'.length);
      } } });
    return { promotionTiming: adapter.promotionTiming, async reviewBatch(requests, options) {
      if (active) return gaps.fail('concurrent_response_replay_not_supported', { lane: 'assessment' });
      requests.forEach(r => attemptedIds.add(r.candidateId));
      active = exactRecord('assessment', requests);
      try {
        const reviews = await adapter.reviewBatch(requests, options);
        assessedRecords.push(active);
        if (!active.assessmentEnd || active.assessmentEnd.event.phase !== 'completed' ||
            active.assessmentEnd.event.requestsJson !== active.assessment.event.requestsJson ||
            JSON.stringify(reviews) !== active.assessmentEnd.event.reviewsJson) gaps.fail('assessment_parser_replay_mismatch', { recordId: active.id });
        return reviews;
      } catch (error) { gaps.add('assessment_replay_failed', { recordId: active?.id }); throw error; }
      finally { active = undefined; }
    } };
  };
  // Separate active slots per adapter call are needed if lanes overlap. This
  // zero-elapsed slice serializes microtasks, and explicitly rejects overlap.
  const relation = () => {
    let adapter;
    return { async verify(query) {
      if (active) return gaps.fail('concurrent_response_replay_not_supported', { lane: query.verificationLane });
      active = exactRecord('relation', query);
      try {
        const Adapter = source.load('libs/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter.ts').AgentRuntimeReaderSummaryStoryRelationVerifier;
        adapter ??= new Adapter({ ...controls.relation, client });
        const decisions = await adapter.verify(query);
        if (active.relationEnd?.event.outcome.status !== 'validated' || !same(decisions, active.relationEnd.event.outcome.decisions)) gaps.fail('relation_parser_replay_mismatch', { recordId: active.id });
        return decisions;
      } catch (error) { gaps.add('relation_replay_failed', { recordId: active?.id, code: error.message }); throw error; }
      finally { active = undefined; }
    } };
  };
  return { reviewer, relation, attemptedIds,
    verifyVerdicts(verdicts) {
      for (const record of assessedRecords) {
        try {
          const expected = JSON.parse(record.assessmentEnd?.event.verdictsJson);
          const ids = JSON.parse(record.assessment.event.requestsJson).map(r => r.candidateId);
          check(Array.isArray(expected) && expected.length === ids.length &&
            new Set(expected.map(row => row.candidateId)).size === ids.length &&
            expected.every(row => ids.includes(row.candidateId) &&
              same(row.verdict, clone(verdicts.get(row.candidateId)))), 'verdict_inventory_mismatch');
        } catch {
          gaps.add('assessment_verdict_replay_mismatch', { recordId: record.id });
        }
      }
    },
    report: () => ({ consumed, observedOutcomes: observations, generatedTransportIds: generated,
      replayMissingRequestCount: gaps.missing(), historicalTimingVerified: false }) };
}
module.exports = { recordedResponses, semantic, ASSESSMENT };
