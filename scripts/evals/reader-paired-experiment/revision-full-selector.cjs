'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { OLD, FINAL, revisionSource, check, digest, sha } = require('./revision-source.cjs');
const { date } = require('./frozen-input.cjs');
const { ports, ledger, clone, canonical, withKeys } = require('./recorded-selector-ports.cjs');
const { recordedResponses } = require('./recorded-model-responses.cjs');
const { replayHost } = require('./replay-host.cjs');
const { detach, preparationTrace, observedPreparation, auditPreparation } = require('./selector-preparation-trace.cjs');
const glueFiles = ['revision-source.cjs', 'revision-parser-dependencies.cjs', 'revision-full-selector.cjs',
  'relation-completion-ledger.cjs', 'capture-owner-receipt.cjs', 'capture-core-observation.cjs', 'p2-observation.cjs', 'controlled-matrix.cjs', 'run.cjs', 'controlled-evaluation-view.cjs', 'recorded-selector-ports.cjs', 'recorded-model-responses.cjs', 'recorded-request-admission.cjs', 'selector-preparation-trace.cjs', 'replay-host.cjs', 'frozen-input.cjs'];
const glue = () => Object.fromEntries(glueFiles.map(file => [file, sha(fs.readFileSync(path.join(__dirname, file)))]));
function exclusionDecisions(revision, selection, native) {
  const evaluations = new Map(native.evaluatedEvidence.map(e => [e.candidateId, e.decision]));
  // FINAL materialization removes exclusions from selectedEvidence before projection.
  const exclusions = new Map((revision === FINAL ? selection.editorialSlate?.excluded ?? [] : [])
    .map(e => [e.candidateId, e.reasonCodes]));
  return (id, assessmentReason) => ({
    placement: exclusions.has(id) || evaluations.has(id) ? 'excluded' : 'noncandidate',
    reason: exclusions.get(id) ?? evaluations.get(id) ?? assessmentReason,
  });
}
async function fullSelector({ repo = process.cwd(), revision, tape, responseTapes = [tape], modelControls, observe = true, mode, evaluation }) {
  const controlled = mode === 'CONTROLLED';
  check(mode === undefined || controlled, 'unsupported_experiment_mode');
  check(controlled === Boolean(evaluation), 'controlled_evaluation_view_required');
  if (controlled) {
    evaluation = require('./controlled-evaluation-view.cjs').evaluationView(evaluation.observation, evaluation.controls, evaluation.declaration);
    check(digest(modelControls) === digest(evaluation.controls.model), 'evaluation_model_controls_mismatch');
  }
  const host = replayHost(), gaps = ledger(), selectionRecord = controlled ? evaluation.controls.selection : tape.files['selection-query.json'];
  const cutoff = selectionRecord.query.observedThrough;
  const source = revisionSource(repo, revision, cutoff, host);
  const load = (file, symbol) => source.load(file)[symbol];
  let result, selection, rankedItems, mappedItems, io, replay, hostReport, trace, quiescence;
  const groups = [], assessmentRequests = [], commands = [];
  try {
    check([OLD, FINAL].includes(revision), 'unapproved_revision');
    if (!controlled) {
      gaps.add('historical_timing_not_verified');
      if (!tape.seal.complete) gaps.add('capture_incomplete', { sealSha256: tape.sealSha256 });
    } else {
      if (!evaluation.observation.provenance.integrityVerified) gaps.add('observation_integrity_unverified');
      if (!require('./p2-observation.cjs').originFor(evaluation.observation) &&
          !require('./capture-core-observation.cjs').coreOriginVerified(evaluation.observation))
        gaps.add('observation_origin_unverified', evaluation.observation.observationRef);
    }
    check(modelControls?.assessment && modelControls?.relation, 'missing_explicit_model_controls');
    io = ports(source, tape, gaps, evaluation);
    check(cutoff === io.cutoff, 'selection_snapshot_cutoff_mismatch');
    const query = withKeys(clone(selectionRecord.query), selectionRecord.presentKeys);
    query.observedThrough = date(cutoff);
    query.period = { ...query.period, startedAt: date(query.period.startedAt), endedAt: date(query.period.endedAt) };
    const scope = controlled ? evaluation.observation.scope : tape.seal.scope;
    check(query.tenantId === scope.tenantId && query.workspaceId === scope.workspaceId &&
      query.period.startedAt.toISOString().slice(0, 10) === io.day, 'selection_scope_or_day_mismatch');
    replay = recordedResponses(source, responseTapes, gaps, io.clock, modelControls, controlled ? { mode, host } : {});
    if (revision === FINAL) {
      const assessment = source.load('libs/relevance/features/rank-feed-items/promotion-content-assessment.ts');
      const original = assessment.assessPromotionContent;
      assessment.assessPromotionContent = async params => {
        assessmentRequests.push(...clone(params.requests));
        const assessed = await original(params);
        replay.verifyVerdicts(assessed.verdicts);
        return assessed;
      };
    }
    const Rank = load('libs/relevance/features/rank-feed-items/rank-feed-items.use-case.ts', 'RankFeedItemsUseCase');
    const rank = new Rank(io.feed, io.deny('profiles'), io.clock, undefined, io.deny('memory'), undefined,
      revision === FINAL ? replay.reviewer() : io.deny('OLD_reviewer'), undefined,
      revision === FINAL ? io.interests : undefined);
    const originalExecute = rank.execute.bind(rank);
    rank.execute = async command => {
      commands.push(canonical(command));
      const value = await originalExecute(command);
      if (value.ok) {
        rankedItems = clone(value.value.items);
        const map = load('libs/summary/adapters/evidence/relevance-reader-summary-evidence-support.ts', 'mapRankedItem');
        mappedItems = value.value.items.map(item => source.invoke(map, revision === FINAL
          ? [item, query.observedThrough, query] : [item, query.observedThrough]));
      }
      return value;
    };
    if (observe) trace = preparationTrace(source);
    const Selector = load('libs/summary/adapters/evidence/relevance-reader-summary-evidence.selector.ts', 'RelevanceReaderSummaryEvidenceSelector');
    const selector = new Selector(rank, io.feed, io.clock,
      controlled ? require('./relation-completion-ledger.cjs').relationCompletionMetrics(source, gaps) : undefined,
      replay.relation(), modelControls.relatedTopicVerifierTimeoutMs);
    if (observe) {
      const originalCluster = selector.clusterer.cluster.bind(selector.clusterer);
      selector.clusterer.cluster = params => {
        const grouped = originalCluster(params);
        groups.push({ input: detach(params), output: clone(grouped) });
        return grouped;
      };
    }
    const selectionOperation = Promise.resolve(source.invoke(selector.select.bind(selector), [query])).then(value => {
      selection = value; return value;
    });
    try { await host.run(selectionOperation, { requireQuiescence: controlled }); }
    catch (error) {
      if (!controlled || selection === undefined) throw error;
      gaps.add('controlled_host_not_quiescent', { code: error.message, ...host.quiescence() });
    }
    trace?.restore();
    for (const failure of trace?.failures ?? []) gaps.add('preparation_observation_failed', failure);
    check(rankedItems && mappedItems, 'rank_inventory_missing');
    const ids = [...io.primaryIds, ...io.supplementalIds], byId = new Map(mappedItems.map(item => [item.feedItemId, item]));
    check(byId.size === ids.length && ids.every(id => byId.has(id)), 'rank_inventory_partition_mismatch');
    const preparation = observe ? observedPreparation({ revision, stages: trace.stages, groups, rankedItems, mappedItems,
      primaryIds: io.primaryIds, supplementalIds: io.supplementalIds, requests: assessmentRequests }) : null;
    const preparationAudit = controlled
      ? { status: observe ? 'controlled_actual_stage_inventory' : 'observation_disabled', historicalCallbackEqualityVerified: false,
        rankInvocations: commands.length, snapshotInvocations: io.calls.filter(c => c.port === 'snapshot').length,
        stages: (trace?.stages ?? []).map(s => s.kind), inventoryComplete: true }
      : observe ? auditPreparation(tape, preparation, selection, revision, gaps) : { status: 'observation_disabled', fields: [] };
    if (controlled && (!observe || commands.length !== 1 || preparationAudit.snapshotInvocations !== 1 ||
        !['period', 'default_provider', 'supplemental', 'verified_relations', 'promotion_policy'].every(kind =>
          trace.stages.some(stage => stage.kind === kind)) || groups.length !== 2)) gaps.add('controlled_preparation_audit_incomplete');
    const projection = load('libs/summary/domain/services/reader-post-promotion-projection.ts', 'buildReaderPostPromotionProjection');
    const native = source.invoke(projection, [{ evidence: selection.selectedEvidence, clusters: selection.clusters,
      sourceWindow: selection.sourceWindow, approvedSameStoryRelations: selection.approvedSameStoryRelations,
      relatedTopicRelations: selection.relatedTopicRelations, editorialSlate: selection.editorialSlate,
      citations: selection.selectedEvidence.map(i => ({ citationId: `promotion-preflight:${i.feedItemId}`,
        feedItemId: i.feedItemId, sourceItemId: i.sourceItemId, providerKey: i.providerKey, field: 'canonicalUrl', canonicalUrl: i.canonicalUrl })) }]);
    const admit = load('libs/summary/domain/services/reader-post-promotion-evidence-admission.ts', 'admitReaderPostPromotionEvidence');
    const admitted = source.invoke(admit, [selection]);
    const placements = new Map();
    for (const [placement, entries] of [['top', native.topReads], ['additional', native.additionalPosts]]) entries.forEach((entry, index) => {
      placements.set(entry.promotionCandidateId, { placement, slot: index + 1, reason: entry.reason,
        supportIds: entry.citationIds.filter(id => id !== `promotion-preflight:${entry.promotionCandidateId}`).map(id => id.replace(/^promotion-preflight:/, '')) });
    });
    const requested = new Set(assessmentRequests.map(r => r.candidateId));
    const exclusionDecision = exclusionDecisions(revision, selection, native);
    const qualityById = new Map(rankedItems.map(i => [i.feedItemId, i.contentQuality]));
    const rows = ids.map((id, index) => {
      const item = byId.get(id), quality = qualityById.get(id), reason = quality?.reason ?? 'missing_quality';
      const attempted = replay.attemptedIds.has(id), asked = requested.has(id);
      const primary = io.raw.candidates.find(c => c.item.id === id);
      const exempt = primary?.canonical.metrics.kind === 'github_repository' ||
        (index >= io.primaryIds.length && item.promotionFacts?.contentKind === 'github_trending');
      const status = revision === OLD ? 'deterministic_legacy' : asked
        ? reason.startsWith('promotion_assessment:') && attempted ? 'model_resolved'
          : ['promotion_assessment_pending:needs_context', 'promotion_assessment_pending:low_confidence'].includes(reason) && attempted ? 'model_abstained' : 'pending'
        : exempt ? 'deterministic_exempt' : reason === 'promotion_assessment_not_requested:hard_gate' ? 'deterministic_hard_gate' : 'pending';
      return { candidateId: id, sourceItemId: item.sourceItemId, provider: item.providerKey,
        partition: index < io.primaryIds.length ? 'primary' : 'supplemental', rawIndex: index < io.primaryIds.length ? index : index - io.primaryIds.length,
        status, requested: asked, attempted, quality, inputHeadlineStatus: item.readerHeadline?.status ?? 'unavailable',
        headlineStatus: admitted.selectedEvidence.find(i => i.feedItemId === id)?.readerHeadline?.status ?? 'unavailable',
        ...exclusionDecision(id, reason), slot: null,
        groupingStages: groups.flatMap((g, stage) => g.input.items.some(i => i.feedItemId === id) ? [stage] : []),
        supportIds: [], ...placements.get(id), artifactId: null };
    });
    const pendingIds = rows.filter(r => ['pending', 'model_abstained'].includes(r.status)).map(r => r.candidateId);
    result = { rows, inventory: { primary: io.primaryIds.map(id => byId.get(id)), supplemental: io.supplementalIds.map(id => byId.get(id)),
      rankingOrder: rankedItems.map(i => i.feedItemId), ranked: rankedItems },
    assessmentCoverage: { pendingIds, unresolvedCandidateCount: pendingIds.length,
      requestedCount: requested.size, attemptedCount: replay.attemptedIds.size },
    clusters: selection.clusters, native, admitted, selection, groupingCalls: groups,
    rankCommands: commands, assessmentRequests, preparation, preparationAudit, preparationStages: trace?.stages ?? [] };
  } catch (error) {
    gaps.add('full_selector_failed', { code: error.message });
    result = { rows: null, assessmentCoverage: { pendingIds: null, unresolvedCandidateCount: null }, groupingCalls: groups,
      rankCommands: commands, assessmentRequests, partialRankedInventory: rankedItems ?? null };
  } finally { trace?.restore(); hostReport = host.report(); quiescence = host.quiescence(); host.close(); }
  const replayReport = replay?.report() ?? { consumed: [], observedOutcomes: [], replayMissingRequestCount: gaps.missing() };
  if (controlled) replayReport.quiescence = quiescence;
  return clone({ format: 'paired-full-selector-arm.v1', revision, complete: false,
    evidenceStatus: 'uncertified_offline_full_selector_slice', actualProducerVerified: false,
    historicalTimingVerified: false, selectorReturned: selection !== undefined,
    ...result, inputSealSha256: tape?.sealSha256 ?? null, controlsSha256: digest(modelControls),
    ...(controlled ? { format: 'paired-controlled-selector-arm.v1', mode,
      controlledExperimentComplete: selection !== undefined && result.rows !== null && gaps.entries().length === 0 && quiescence.settled,
      historicalReplayComplete: false, actualProducerVerified: gaps.entries().length === 0 && quiescence.settled, observation: evaluation.observation, evaluationControlsSha256: evaluation.controlsSha256,
      evaluationClock: cutoff, evaluationDeclaration: evaluation.declaration, quiescence,
      evidenceStatus: 'controlled_offline_execution_with_explicit_provenance_gaps' } : {}),
    source: source.identity(), instrumentation: glue(), portCalls: io?.calls ?? [], replay: replayReport,
    host: hostReport, gaps: gaps.entries(), artifactId: null });
}
module.exports = { fullSelector, exclusionDecisions };
