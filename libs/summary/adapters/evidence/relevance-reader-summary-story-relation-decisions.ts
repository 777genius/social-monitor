import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  aggregateStoryRelationDecisionTraces,
  buildGuardedRecallCandidates,
  buildStoryRelationCandidates,
  guardedRecallCandidateStillEligible,
  reconcileStoryRelationDecisions,
  STORY_RANKING_POLICY_V1,
  STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
  STORY_RELATION_CANDIDATE_POLICY_VERSION,
  STORY_RELATION_GUARDED_RECALL_CONFIDENCE_MIN,
  STORY_RELATION_GUARDED_RECALL_POLICY_VERSION,
  storyRelationHardNegative,
  terminalStoryRelationDecisionTraces,
  verifiedStoryRelationPairKey,
  type ApprovedSameStoryRelation,
  type GuardedRecallCandidate,
  type StoryRelationCandidate,
  type StoryRelationDecision,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  InvalidStoryRelationDecisionBatchError,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryStoryRelationVerifierPort,
  type StoryRankingMetricsPort,
  type VerifiedStoryRelationDecisionBatch,
} from "../../ports";

export const GUARDED_RECALL_PRIMARY_TIMEOUT_MS = 30_000;

type RelationLane = "semantic_primary" | "guarded_recall_primary";
type VerifiedRelations = Readonly<{
  pairs: ReadonlySet<string>;
  relations: readonly ApprovedSameStoryRelation[];
}>;

export const verifiedReaderSummaryStoryRelationPairs = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
}): Promise<ReadonlySet<string>> =>
  (await verifiedReaderSummaryStoryRelations(params)).pairs;

export const verifiedReaderSummaryStoryRelations = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
  readonly additionalCandidates?: readonly StoryRelationCandidate[];
  readonly guardedRecallTimeoutMs?: number;
}): Promise<VerifiedRelations> => {
  const evidenceById = new Map(params.evidence.map((item) =>
    [item.feedItemId, item] as const));
  const primaryCandidates = safeCandidates(uniqueCandidates([
    ...buildStoryRelationCandidates({
      selection: params.deterministicSelection,
      evidence: params.evidence,
    }),
    ...(params.additionalCandidates ?? []),
  ]), evidenceById);
  const guardedGeneration = params.verifier?.guardedPrimaryRecallCertification ===
      "agent_runtime_attested_v1"
    ? buildGuardedRecallCandidates({
        selection: params.deterministicSelection,
        evidence: params.evidence,
        primaryCandidates,
      })
    : { candidates: [], aggregates: [] };
  safelyRecord(() => params.metrics.recordGuardedRecallGeneration?.(
    guardedGeneration.aggregates));

  const [semantic, guarded] = await Promise.all([
    verifyLane({
      ...params,
      candidates: primaryCandidates,
      evidenceById,
      lane: "semantic_primary",
      threshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
      candidatePolicyVersion: STORY_RELATION_CANDIDATE_POLICY_VERSION,
    }),
    verifyLane({
      ...params,
      verifier: guardedGeneration.candidates.length === 0
        ? undefined
        : params.verifier,
      candidates: guardedGeneration.candidates,
      evidenceById,
      lane: "guarded_recall_primary",
      threshold: STORY_RELATION_GUARDED_RECALL_CONFIDENCE_MIN,
      candidatePolicyVersion: STORY_RELATION_GUARDED_RECALL_POLICY_VERSION,
      timeoutMs: params.guardedRecallTimeoutMs ?? GUARDED_RECALL_PRIMARY_TIMEOUT_MS,
    }),
  ]);
  const relations = [...semantic.relations, ...guarded.relations]
    .sort((left, right) => left.canonicalPairId.localeCompare(right.canonicalPairId));
  return {
    pairs: new Set(relations.map((relation) => relation.canonicalPairId)),
    relations,
  };
};

const verifyLane = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly deterministicSelection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics: StoryRankingMetricsPort;
  readonly candidates: readonly (StoryRelationCandidate | GuardedRecallCandidate)[];
  readonly evidenceById: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly lane: RelationLane;
  readonly threshold: number;
  readonly candidatePolicyVersion: string;
  readonly timeoutMs?: number;
}): Promise<VerifiedRelations> => {
  const startedAt = performance.now();
  if (params.verifier === undefined || params.candidates.length === 0) {
    const traces = terminalStoryRelationDecisionTraces({
      candidates: params.candidates,
      rankingPolicyVersion: params.deterministicSelection.rankingPolicyVersion,
      approvalThreshold: params.threshold,
      candidatePolicyVersion: params.candidatePolicyVersion,
      disposition: params.verifier === undefined
        ? "verifier_unavailable" : "verifier_skipped",
    });
    recordDecisionTraces(params.metrics, traces);
    recordVerificationMetric(params, "skipped", 0, false, startedAt);
    return emptyRelations;
  }
  try {
    const controller = new AbortController();
    const input = {
      tenantId: params.query.tenantId,
      workspaceId: params.query.workspaceId,
      scope: params.query.scope,
      period: params.query.period,
      requestedAt: params.requestedAt,
      clusters: params.deterministicSelection.clusters,
      evidence: params.evidence,
      candidates: params.candidates,
      verificationLane: params.lane,
      ...(params.timeoutMs === undefined ? {} : { signal: controller.signal }),
      ...(params.timeoutMs === undefined ? {} : { timeoutMs: params.timeoutMs }),
    } as const;
    const batch = params.timeoutMs === undefined
      ? await params.verifier.verify(input)
      : await withTimeout(params.verifier.verify(input), params.timeoutMs, controller);
    assertVerifiedBatch(batch, params.lane);
    const decisionBatch = reconcileStoryRelationDecisions({
      candidates: params.candidates,
      decisions: batch.decisions as readonly StoryRelationDecision[],
      rankingPolicyVersion: params.deterministicSelection.rankingPolicyVersion,
      approvalThreshold: params.threshold,
      candidatePolicyVersion: params.candidatePolicyVersion,
    });
    const candidateByPair = new Map(params.candidates.map((candidate) =>
      [candidatePairId(candidate), candidate] as const));
    const relations = decisionBatch.traces.flatMap((trace) => {
      if (!trace.applied || trace.confidenceScore === undefined) return [];
      const candidate = candidateByPair.get(trace.pairId);
      if (candidate === undefined || !candidateStillSafe(candidate, params)) return [];
      return [appliedRelation({
        candidate,
        confidence: trace.confidenceScore,
        lane: params.lane,
        candidatePolicyVersion: params.candidatePolicyVersion,
        rankingPolicyVersion: params.deterministicSelection.rankingPolicyVersion,
        proof: batch.proof,
      })];
    });
    const appliedPairIds = new Set(relations.map((relation) =>
      relation.canonicalPairId));
    const finalTraces = decisionBatch.traces.map((trace) =>
      trace.applied && !appliedPairIds.has(trace.pairId)
        ? { ...trace, disposition: "rejected_deterministic_revalidation" as const,
            applied: false }
        : trace);
    recordDecisionTraces(params.metrics, finalTraces);
    recordVerificationMetric(params,
      decisionBatch.responseAccepted ? "completed" : "failed_closed",
      relations.length, true, startedAt);
    return {
      pairs: new Set(relations.map((relation) => relation.canonicalPairId)),
      relations,
    };
  } catch (error) {
    const traces = terminalStoryRelationDecisionTraces({
      candidates: params.candidates,
      rankingPolicyVersion: params.deterministicSelection.rankingPolicyVersion,
      approvalThreshold: params.threshold,
      candidatePolicyVersion: params.candidatePolicyVersion,
      disposition: "verifier_failed_closed",
      failureReason: error instanceof InvalidStoryRelationDecisionBatchError
        ? error.reason : "verifier_exception",
    });
    recordDecisionTraces(params.metrics, traces);
    recordVerificationMetric(params, "failed_closed", 0, false, startedAt);
    return emptyRelations;
  }
};

const safeCandidates = (
  candidates: readonly StoryRelationCandidate[],
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly StoryRelationCandidate[] => candidates.filter((candidate) =>
  candidateStillSafe(candidate, {
    evidenceById,
    lane: "semantic_primary",
  }));

const candidateStillSafe = (
  candidate: StoryRelationCandidate | GuardedRecallCandidate,
  params: Pick<Parameters<typeof verifyLane>[0], "evidenceById" | "lane">,
): boolean => {
  const left = params.evidenceById.get(candidate.leftFeedItemId);
  const right = params.evidenceById.get(candidate.rightFeedItemId);
  if (left === undefined || right === undefined || left.title.trim() === "" ||
      right.title.trim() === "" || !Number.isFinite(left.publishedAt.getTime()) ||
      !Number.isFinite(right.publishedAt.getTime()) ||
      Math.abs(left.publishedAt.getTime() - right.publishedAt.getTime()) >
        30 * 60 * 60 * 1000 ||
      storyRelationHardNegative({ left, right,
        policy: STORY_RANKING_POLICY_V1 }) !== undefined) return false;
  return params.lane !== "guarded_recall_primary" ||
    guardedRecallCandidateStillEligible({
      candidate: candidate as GuardedRecallCandidate,
      evidenceById: params.evidenceById,
    });
};

const appliedRelation = (params: {
  readonly candidate: StoryRelationCandidate | GuardedRecallCandidate;
  readonly confidence: number;
  readonly lane: RelationLane;
  readonly candidatePolicyVersion: string;
  readonly rankingPolicyVersion: string;
  readonly proof: VerifiedStoryRelationDecisionBatch["proof"];
}): ApprovedSameStoryRelation => {
  const canonicalPairId = candidatePairId(params.candidate);
  return {
    canonicalPairId,
    leftFeedItemId: params.candidate.leftFeedItemId,
    rightFeedItemId: params.candidate.rightFeedItemId,
    confidence: params.confidence,
    verificationLane: params.lane,
    candidatePolicyVersion: params.candidatePolicyVersion,
    rankingPolicyVersion: params.rankingPolicyVersion,
    featureDigest: "featureDigest" in params.candidate
      ? params.candidate.featureDigest
      : semanticFeatureDigest(params.candidate),
    executionAttestationSha256: params.proof.executionAttestationSha256,
    normalizedOutputSha256: params.proof.normalizedOutputSha256,
    selectedOutputSha256: params.proof.selectedOutputSha256,
  };
};

const semanticFeatureDigest = (candidate: StoryRelationCandidate): string =>
  createHash("sha256").update(JSON.stringify({
    pairId: candidatePairId(candidate),
    sharedTopicTokens: candidate.sharedTopicTokens,
    sharedAnchorTokens: candidate.sharedAnchorTokens,
    sharedEventTokens: candidate.sharedEventTokens,
    sharedSpecificProductTokens: candidate.sharedSpecificProductTokens,
    topicSimilarity: candidate.topicSimilarity,
  }), "utf8").digest("hex");

const assertVerifiedBatch = (
  batch: VerifiedStoryRelationDecisionBatch,
  lane: RelationLane,
): void => {
  const hashes = [batch.proof.executionAttestationSha256,
    batch.proof.normalizedOutputSha256, batch.proof.selectedOutputSha256];
  if (batch.verificationLane !== lane ||
      hashes.some((hash) => !/^[0-9a-f]{64}$/u.test(hash))) {
    throw new Error("Story relation verification proof is invalid");
  }
};

const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Guarded recall verification timed out"));
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const uniqueCandidates = (
  candidates: readonly StoryRelationCandidate[],
): readonly StoryRelationCandidate[] => {
  const byPair = new Map<string, StoryRelationCandidate>();
  for (const candidate of candidates) {
    const key = candidatePairId(candidate);
    if (!byPair.has(key)) byPair.set(key, candidate);
  }
  return [...byPair.values()].sort((left, right) =>
    candidatePairId(left).localeCompare(candidatePairId(right)));
};

const candidatePairId = (candidate: StoryRelationCandidate): string =>
  verifiedStoryRelationPairKey(candidate.leftFeedItemId,
    candidate.rightFeedItemId);

const recordDecisionTraces = (
  metrics: StoryRankingMetricsPort,
  traces: Parameters<typeof aggregateStoryRelationDecisionTraces>[0],
): void => safelyRecord(() => metrics.recordStoryRelationDecisionAggregates?.(
  aggregateStoryRelationDecisionTraces(traces)));

const recordVerificationMetric = (
  params: Pick<Parameters<typeof verifyLane>[0], "metrics" | "lane" | "candidates">,
  status: "skipped" | "completed" | "failed_closed",
  approvedCount: number,
  attested: boolean,
  startedAt: number,
): void => safelyRecord(() => params.metrics.recordStoryRelationVerification({
  lane: params.lane,
  status,
  candidateCount: params.candidates.length,
  approvedCount,
  rejectedCount: params.candidates.length - approvedCount,
  latencyMs: Math.max(0, performance.now() - startedAt),
  attested,
}));

const safelyRecord = (record: () => void): void => {
  try { record(); } catch { /* Metrics cannot alter selection. */ }
};
const emptyRelations: VerifiedRelations = { pairs: new Set(), relations: [] };
