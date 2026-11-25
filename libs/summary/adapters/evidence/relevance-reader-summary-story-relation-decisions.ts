import {
  aggregateStoryRelationDecisionTraces,
  buildBoundedStrictTitleStoryRelationCandidates,
  buildStoryRelationCandidates,
  buildStoryRelationSafeRecallShadowCandidates,
  reconcileStoryRelationDecisions,
  reconcileStoryRelationSafeRecallShadowDecisions,
  STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
  terminalStoryRelationSafeRecallShadowTraces,
  terminalStoryRelationDecisionTraces,
  aggregateStoryRelationSafeRecallShadowTraces,
  type StoryRelationSafeRecallShadowDecisionTrace,
  type StoryRelationCandidate,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
  type ApprovedSameStoryRelation,
} from "../../domain";
import {
  InvalidStoryRelationDecisionBatchError,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryStoryRelationVerifierPort,
  type StoryRankingMetricsPort,
} from "../../ports";

export const verifiedReaderSummaryStoryRelationPairs = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
}): Promise<ReadonlySet<string>> => {
  const result = await verifiedReaderSummaryStoryRelations(params);
  return result.pairs;
};

export const verifiedReaderSummaryStoryRelations = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
  readonly additionalCandidates?: readonly StoryRelationCandidate[];
}): Promise<{
  readonly pairs: ReadonlySet<string>;
  readonly strictTitlePairs: ReadonlySet<string>;
  readonly relations: readonly ApprovedSameStoryRelation[];
  readonly candidates: readonly StoryRelationCandidate[];
}> => {
  const primaryCandidates = buildStoryRelationCandidates({
    selection: params.deterministicSelection,
    evidence: params.evidence,
  });
  const strictTitleRecallCandidates =
    buildBoundedStrictTitleStoryRelationCandidates({
      selection: params.deterministicSelection,
      evidence: params.evidence,
      primaryCandidates,
    });
  const candidates = uniqueCandidates([
    ...primaryCandidates,
    ...strictTitleRecallCandidates,
    ...(params.additionalCandidates ?? []),
  ]);
  const result = await verifiedPrimaryStoryRelations({
    ...params,
    candidates,
  });
  const strictTitlePairIds = new Set(
    strictTitleRecallCandidates.map(candidatePairKey),
  );
  return {
    ...result,
    candidates,
    strictTitlePairs: new Set(
      [...result.pairs].filter((pairId) => strictTitlePairIds.has(pairId)),
    ),
  };
};

const uniqueCandidates = (
  candidates: readonly StoryRelationCandidate[],
): readonly StoryRelationCandidate[] => {
  const byPair = new Map<string, StoryRelationCandidate>();
  for (const candidate of candidates) {
    const key = candidatePairKey(candidate);
    if (!byPair.has(key)) byPair.set(key, candidate);
  }
  return [...byPair.values()];
};

const candidatePairKey = (candidate: StoryRelationCandidate): string =>
  [candidate.leftFeedItemId, candidate.rightFeedItemId]
    .sort().join("\u0000");

export const scheduleReaderSummarySafeRecallShadowObservation = (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
  readonly authoritativeCandidates: readonly StoryRelationCandidate[];
}): void => {
  scheduleSafeRecallShadow(() => observeSafeRecallShadow({
    ...params,
    primaryCandidates: params.authoritativeCandidates,
  }));
};

const verifiedPrimaryStoryRelations = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
  readonly candidates: readonly StoryRelationCandidate[];
}): Promise<{
  readonly pairs: ReadonlySet<string>;
  readonly relations: readonly ApprovedSameStoryRelation[];
}> => {
  const { candidates } = params;
  if (params.verifier === undefined || candidates.length === 0) {
    safelyRecord(() =>
      params.metrics.recordStoryRelationVerification({
        status: "skipped",
        candidateCount: candidates.length,
        approvedCount: 0,
      }),
    );
    recordDecisionTraces({
      metrics: params.metrics,
      traces: terminalStoryRelationDecisionTraces({
        candidates,
        rankingPolicyVersion:
          params.deterministicSelection.rankingPolicyVersion,
        approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
        disposition:
          params.verifier === undefined
            ? "verifier_unavailable"
            : "verifier_skipped",
      }),
    });
    return { pairs: new Set(), relations: [] };
  }

  try {
    const decisions = await params.verifier.verify({
      tenantId: params.query.tenantId,
      workspaceId: params.query.workspaceId,
      scope: params.query.scope,
      period: params.query.period,
      requestedAt: params.requestedAt,
      clusters: params.deterministicSelection.clusters,
      evidence: params.evidence,
      candidates,
    });
    const decisionBatch = reconcileStoryRelationDecisions({
      candidates,
      decisions,
      rankingPolicyVersion: params.deterministicSelection.rankingPolicyVersion,
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
    });
    recordDecisionTraces({
      metrics: params.metrics,
      traces: decisionBatch.traces,
    });
    safelyRecord(() =>
      params.metrics.recordStoryRelationVerification({
        status: decisionBatch.responseAccepted
          ? "completed"
          : "failed_closed",
        candidateCount: candidates.length,
        approvedCount: decisionBatch.approvedPairs.size,
      }),
    );
    const candidateByPair = new Map(
      candidates.map((candidate) => [
        [candidate.leftFeedItemId, candidate.rightFeedItemId].sort().join("\u0000"),
        candidate,
      ] as const),
    );
    return {
      pairs: decisionBatch.approvedPairs,
      relations: decisionBatch.traces.flatMap((trace) => {
        if (!trace.applied || trace.confidenceScore === undefined) return [];
        const candidate = candidateByPair.get(trace.pairId);
        return candidate === undefined ? [] : [{
          leftFeedItemId: candidate.leftFeedItemId,
          rightFeedItemId: candidate.rightFeedItemId,
          confidence: trace.confidenceScore,
        }];
      }),
    };
  } catch (error) {
    recordDecisionTraces({
      metrics: params.metrics,
      traces: terminalStoryRelationDecisionTraces({
        candidates,
        rankingPolicyVersion:
          params.deterministicSelection.rankingPolicyVersion,
        approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
        disposition: "verifier_failed_closed",
        failureReason:
          error instanceof InvalidStoryRelationDecisionBatchError
            ? error.reason
            : "verifier_exception",
      }),
    });
    safelyRecord(() =>
      params.metrics.recordStoryRelationVerification({
        status: "failed_closed",
        candidateCount: candidates.length,
        approvedCount: 0,
      }),
    );
    return { pairs: new Set(), relations: [] };
  }
};

export const STORY_RELATION_SAFE_RECALL_SHADOW_TIMEOUT_MS = 30_000;

const scheduleSafeRecallShadow = (run: () => Promise<unknown>): void => {
  const scheduled = setImmediate(() => {
    void run().catch(() => {
      // The independently bounded shadow lane must never delay or change selection.
    });
  });
  scheduled.unref();
};

export const observeSafeRecallShadow = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
  readonly primaryCandidates: readonly StoryRelationCandidate[];
  readonly timeoutMs?: number;
}): Promise<readonly StoryRelationSafeRecallShadowDecisionTrace[]> => {
  const generation = buildStoryRelationSafeRecallShadowCandidates({
    selection: params.deterministicSelection,
    evidence: params.evidence,
    primaryCandidates: params.primaryCandidates,
  });
  safelyRecord(() =>
    params.metrics.recordStoryRelationSafeRecallShadowGeneration?.(
      generation.aggregates,
    ),
  );
  if (generation.candidates.length === 0) return [];

  if (params.verifier === undefined) {
    const traces = terminalStoryRelationSafeRecallShadowTraces({
      candidates: generation.candidates,
      rankingPolicyVersion:
        params.deterministicSelection.rankingPolicyVersion,
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
      disposition: "verifier_unavailable",
    });
    recordShadowTraces({ metrics: params.metrics, traces });
    return traces;
  }

  try {
    const timeoutMs =
      params.timeoutMs ?? STORY_RELATION_SAFE_RECALL_SHADOW_TIMEOUT_MS;
    const controller = new AbortController();
    const decisions = await withShadowTimeout(
      params.verifier.verify({
        tenantId: params.query.tenantId,
        workspaceId: params.query.workspaceId,
        scope: params.query.scope,
        period: params.query.period,
        requestedAt: params.requestedAt,
        clusters: params.deterministicSelection.clusters,
        evidence: params.evidence,
        candidates: generation.candidates,
        verificationLane: "safe_recall_shadow",
        timeoutMs,
        signal: controller.signal,
      }),
      timeoutMs,
      controller,
    );
    const batch = reconcileStoryRelationSafeRecallShadowDecisions({
      candidates: generation.candidates,
      decisions,
      rankingPolicyVersion: params.deterministicSelection.rankingPolicyVersion,
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
    });
    safelyRecord(() =>
      params.metrics.recordStoryRelationSafeRecallShadowDecisions?.(
        batch.aggregates,
      ),
    );
    return batch.traces;
  } catch (error) {
    const traces = terminalStoryRelationSafeRecallShadowTraces({
      candidates: generation.candidates,
      rankingPolicyVersion:
        params.deterministicSelection.rankingPolicyVersion,
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
      disposition: "verifier_failed_closed",
      failureReason:
        error instanceof InvalidStoryRelationDecisionBatchError
          ? error.reason
          : "verifier_exception",
    });
    recordShadowTraces({ metrics: params.metrics, traces });
    return traces;
  }
};

const withShadowTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Safe-recall shadow verification timed out"));
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const recordDecisionTraces = (params: {
  readonly metrics: StoryRankingMetricsPort;
  readonly traces: Parameters<typeof aggregateStoryRelationDecisionTraces>[0];
}): void => {
  const aggregates = aggregateStoryRelationDecisionTraces(params.traces);
  safelyRecord(() =>
    params.metrics.recordStoryRelationDecisionAggregates?.(aggregates),
  );
};

const recordShadowTraces = (params: {
  readonly metrics: StoryRankingMetricsPort;
  readonly traces: Parameters<
    typeof aggregateStoryRelationSafeRecallShadowTraces
  >[0];
}): void => {
  const aggregates = aggregateStoryRelationSafeRecallShadowTraces(
    params.traces,
  );
  safelyRecord(() =>
    params.metrics.recordStoryRelationSafeRecallShadowDecisions?.(aggregates),
  );
};

const safelyRecord = (record: () => void): void => {
  try {
    record();
  } catch {
    // Observability must never alter evidence selection or relation decisions.
  }
};
