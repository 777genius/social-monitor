import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  evaluateStoryRelationGoldenCases,
  StoryClusteringService,
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
import {
  observeSafeRecallShadow,
  verifiedReaderSummaryStoryRelations,
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
    const evidence = evidenceFor(evalCase);
    const selection = new StoryClusteringService({
      now: () => observedAt,
    }).cluster({
      identity,
      items: evidence,
      limit: evidence.length,
      now: observedAt,
    });
    const authoritative = await verifiedReaderSummaryStoryRelations({
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
      primaryCandidates: authoritative.candidates,
    });
    predictions.push({
      caseId: evalCase.caseId,
      sameStory:
        deterministicPairMerged(selection, evalCase.caseId) ||
        authoritative.pairs.size > 0 ||
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
