import {
  buildRelatedTopicCandidates,
  reconcileRelatedTopicVerdicts,
  isValidRelatedTopicVerdictBatch,
  type RelatedTopicRelation,
  type SummaryEvidenceSelection,
} from "../../domain";
import type {
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryStoryRelationVerifierPort,
  StoryRankingMetricsPort,
} from "../../ports";

export const RELATED_TOPIC_VERIFIER_TIMEOUT_MS = 15_000;

export const verifiedReaderSummaryRelatedTopics = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly selection: SummaryEvidenceSelection;
  readonly requestedAt: Date;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
  readonly metrics?: StoryRankingMetricsPort;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}): Promise<readonly RelatedTopicRelation[]> => {
  const startedAt = params.now?.().getTime() ?? params.requestedAt.getTime();
  const candidates = buildRelatedTopicCandidates({ selection: params.selection });
  if (params.verifier === undefined || candidates.length === 0) {
    recordMetric(params, {
      status: "skipped",
      candidateCount: candidates.length,
      approvedCount: 0,
      latencyMs: elapsedMs(startedAt, params.now),
    });
    return [];
  }
  const timeoutMs = params.timeoutMs ?? RELATED_TOPIC_VERIFIER_TIMEOUT_MS;
  const controller = new AbortController();
  try {
    const decisions = await withRelatedTopicTimeout(params.verifier.verify({
      tenantId: params.query.tenantId,
      workspaceId: params.query.workspaceId,
      scope: params.query.scope,
      period: params.query.period,
      requestedAt: params.requestedAt,
      clusters: params.selection.clusters,
      evidence: params.selection.selectedEvidence,
      candidates,
      verificationLane: "related_topic",
      timeoutMs,
      signal: controller.signal,
    }), timeoutMs, controller);
    if (!isValidRelatedTopicVerdictBatch({ candidates, decisions })) {
      throw new Error("Related topic verifier returned an invalid decision batch");
    }
    const relations = reconcileRelatedTopicVerdicts({
      candidates,
      decisions,
      evidence: params.selection.selectedEvidence,
      clusters: params.selection.clusters,
    });
    recordMetric(params, {
      status: "completed",
      candidateCount: candidates.length,
      approvedCount: relations.length,
      latencyMs: elapsedMs(startedAt, params.now),
    });
    return relations;
  } catch (error) {
    recordMetric(params, {
      status: error instanceof RelatedTopicVerifierTimeoutError
        ? "timed_out"
        : "failed_closed",
      candidateCount: candidates.length,
      approvedCount: 0,
      latencyMs: elapsedMs(startedAt, params.now),
    });
    return [];
  }
};

class RelatedTopicVerifierTimeoutError extends Error {}

const withRelatedTopicTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RelatedTopicVerifierTimeoutError());
      controller.abort();
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const elapsedMs = (startedAt: number, now: (() => Date) | undefined): number =>
  Math.max(0, (now?.().getTime() ?? startedAt) - startedAt);

const recordMetric = (
  params: { readonly metrics?: StoryRankingMetricsPort },
  metric: Parameters<NonNullable<StoryRankingMetricsPort["recordRelatedTopicVerification"]>>[0],
): void => {
  try {
    params.metrics?.recordRelatedTopicVerification?.(metric);
  } catch {
    // Aggregate observability cannot alter a relation decision.
  }
};
