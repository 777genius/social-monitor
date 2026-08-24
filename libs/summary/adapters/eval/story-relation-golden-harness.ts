import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildStoryRelationCandidates,
  evaluateStoryRelationGoldenCases,
  type StoryRelationEvalPrediction,
  type StoryRelationEvalResult,
  type StoryRelationGoldenCase,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  NOOP_STORY_RANKING_METRICS,
  type AgentRuntimeClientPort,
} from "../../ports";
import { RelevanceReaderSummaryEvidenceSelector } from "../evidence/relevance-reader-summary-evidence.selector";
import {
  observeSafeRecallShadow,
  verifiedReaderSummaryStoryRelationPairs,
} from "../evidence/relevance-reader-summary-story-relation-decisions";
import { AgentRuntimeReaderSummaryStoryRelationVerifier } from "../model/agent-runtime-reader-summary-story-relation-verifier.adapter";

const observedAt = new Date("2026-07-20T12:00:00.000Z");
const identity = {
  tenantId: tenantId("tenant-story-relation-golden"),
  workspaceId: workspaceId("workspace-story-relation-golden"),
  scope: { type: "workspace" as const },
};

/**
 * Label-neutral executable baseline. Expected labels are consulted only by the
 * evaluator after clustering, candidate generation, and reconciliation finish.
 */
export const runStoryRelationGoldenBaseline = async (params: {
  readonly datasetVersion: string;
  readonly cases: readonly StoryRelationGoldenCase[];
  readonly client: AgentRuntimeClientPort;
}): Promise<StoryRelationEvalResult> => {
  const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
    client: params.client,
  });
  const predictions: StoryRelationEvalPrediction[] = [];
  for (const evalCase of params.cases) {
    const query = {
      ...identity,
      period: {
        cadence: "daily" as const,
        startedAt: observedAt,
        endedAt: new Date("2026-07-21T12:00:00.000Z"),
        timezone: "UTC",
        periodKey: "story-relation-golden",
      },
      maxItems: 2,
    };
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker(rankedItemsFor(evalCase)),
      emptyFeedRepository(),
      { now: () => observedAt },
    );
    const selection = await selector.select(query);
    const evidence = evidenceFor(evalCase);
    const primaryCandidates = buildStoryRelationCandidates({
      selection,
      evidence,
    });
    const approvedPrimaryPairs = await verifiedReaderSummaryStoryRelationPairs({
      query,
      evidence,
      deterministicSelection: selection,
      requestedAt: observedAt,
      verifier,
      metrics: NOOP_STORY_RANKING_METRICS,
    });
    const traces = await observeSafeRecallShadow({
      query,
      evidence,
      deterministicSelection: selection,
      requestedAt: observedAt,
      verifier,
      metrics: NOOP_STORY_RANKING_METRICS,
      primaryCandidates,
    });
    predictions.push({
      caseId: evalCase.caseId,
      sameStory:
        deterministicPairMerged(selection, evalCase.caseId) ||
        approvedPrimaryPairs.size > 0 ||
        traces.some((trace) => trace.wouldApprove),
    });
  }

  return evaluateStoryRelationGoldenCases({
    datasetVersion: params.datasetVersion,
    cases: params.cases,
    predictions,
  });
};

const deterministicPairMerged = (
  selection: SummaryEvidenceSelection,
  caseId: string,
): boolean => {
  const pairIds = new Set([`${caseId}:left`, `${caseId}:right`]);
  return selection.clusters.some((cluster) =>
    [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]
      .filter((feedItemId) => pairIds.has(feedItemId))
      .length === pairIds.size,
  );
};

const evidenceFor = (
  evalCase: StoryRelationGoldenCase,
): readonly SummaryEvidenceItem[] => [
  summaryEvidence(evalCase.caseId, "left", evalCase.left, 2),
  summaryEvidence(evalCase.caseId, "right", evalCase.right, 1),
];

const summaryEvidence = (
  caseId: string,
  side: "left" | "right",
  evidence: StoryRelationGoldenCase["left"],
  score: number,
): SummaryEvidenceItem => ({
  feedItemId: `${caseId}:${side}`,
  sourceItemId: `source:${caseId}:${side}`,
  sourceBindingId: `binding:${caseId}:${side}`,
  interestId: "story-relation-golden",
  providerKey: evidence.providerKey,
  canonicalUrl: `https://${evidence.providerKey}.example.test/${caseId}/${side}`,
  title: evidence.title,
  bodyPreview: evidence.bodyPreview,
  publishedAt: observedAt,
  observedAt,
  score,
  whyImportant: ["Frozen story relation evaluation evidence"],
});

const rankedItemsFor = (
  evalCase: StoryRelationGoldenCase,
): readonly RankedFeedItemView[] => [
  rankedItem(evalCase.caseId, "left", evalCase.left, 1),
  rankedItem(evalCase.caseId, "right", evalCase.right, 2),
];

const rankedItem = (
  caseId: string,
  side: "left" | "right",
  evidence: StoryRelationGoldenCase["left"],
  rank: number,
): RankedFeedItemView => ({
  feedItemId: `${caseId}:${side}`,
  sourceItemId: `source:${caseId}:${side}`,
  sourceBindingId: `binding:${caseId}:${side}`,
  interestId: "story-relation-golden",
  providerKey: evidence.providerKey,
  canonicalUrl: `https://${evidence.providerKey}.example.test/${caseId}/${side}`,
  title: evidence.title,
  bodyPreview: evidence.bodyPreview,
  publishedAt: observedAt.toISOString(),
  observedAt: observedAt.toISOString(),
  score: 3 - rank,
  rank,
  clusterId: `rank-cluster:${caseId}:${side}`,
  clusterSize: 1,
  duplicateFeedItemIds: [],
  whyImportant: ["Frozen story relation evaluation evidence"],
  safety: {
    status: "allowed",
    categories: ["normalized_preview_only"],
    rawPayloadRetained: false,
    retentionPolicy: "normalized_preview_only",
  },
  contentQuality: {
    qualityScore: 1,
    interestRelevanceScore: 1,
    engagementIntegrityScore: 1,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Frozen golden fixture",
  },
});

const ranker = (items: readonly RankedFeedItemView[]): RankFeedItemsUseCase =>
  ({
    execute: async () =>
      ok({
        generatedAt: observedAt.toISOString(),
        profileApplied: false,
        items,
      }),
  }) as unknown as RankFeedItemsUseCase;

const emptyFeedRepository = (): FeedItemReadRepositoryPort => ({
  list: async () => ({ items: [] }),
  findById: async () => null,
});
