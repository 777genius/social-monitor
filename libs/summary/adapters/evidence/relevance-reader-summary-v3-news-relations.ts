import {
  buildStoryRelationCandidates,
  reconcileStoryRelationDecisions,
  STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
  type ReaderPostPromotionV3Candidate,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import { compareUnrankedReaderPromotion, READER_PROMOTION_PRESENTATION_BUDGET } from
  "../../domain/policies/reader-promotion-ranking";
import { newsAggregatorTitleParts } from
  "../../domain/policies/reader-promotion-news-publisher";
import type { ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort } from "../../ports";
import { semanticAdmission } from "./relevance-reader-summary-v3-story-relations";

const timeoutMs = 90_000;

/**
 * One bounded semantic pass before headline work. Retrieval never merges stories:
 * only an accepted, complete verifier batch can authorize a pair. Candidates
 * beyond the 64-item/32-pair bounds keep their deterministic identities.
 */
export const verifiedPromotionNewsPairs = async (params: {
  readonly candidates: readonly ReaderPostPromotionV3Candidate[];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly selection: SummaryEvidenceSelection;
  readonly query: Pick<ReaderSummaryStoryRelationVerifierInput,
    "tenantId" | "workspaceId" | "scope" | "period" | "requestedAt">;
  readonly verifier?: ReaderSummaryStoryRelationVerifierPort;
}): Promise<ReadonlySet<string>> => {
  if (params.verifier === undefined) return new Set();
  const clusterById = new Map(params.selection.clusters.flatMap((cluster) =>
    [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds]
      .map((id) => [id, cluster.id] as const)));
  const byId = new Map(params.evidence.map((item) => [item.feedItemId, item]));
  const evidence = [...params.candidates].filter((candidate) =>
    semanticAdmission(candidate) && candidate.providerKey === "rss" &&
    newsAggregatorTitleParts(candidate) !== null)
    .sort((left, right) => compareUnrankedReaderPromotion(
      { ...left, usefulness: left.answers.usefulness.choice, popularity: null },
      { ...right, usefulness: right.answers.usefulness.choice, popularity: null }))
    .flatMap((candidate) => {
      const cluster = clusterById.get(candidate.candidateId);
      const item = byId.get(candidate.candidateId);
      if (cluster === undefined || item === undefined) return [];
      return [item];
    }).slice(0, READER_PROMOTION_PRESENTATION_BUDGET);
  // RSS snapshots can contain only an HTML teaser with opaque aggregator URLs.
  // Retrieve by the source headline; the verifier still sees the full evidence.
  const candidates = buildStoryRelationCandidates({ selection: params.selection,
    independentNewsPublishers: true,
    evidence: evidence.map((item) => ({ ...item, bodyPreview: "" })) });
  if (candidates.length === 0) return new Set();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const decisions = await Promise.race([
      params.verifier.verify({ ...params.query, evidence, candidates,
        clusters: params.selection.clusters, verificationLane: "independent_news",
        timeoutMs, signal: controller.signal }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("News story verification timed out"));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
    return reconcileStoryRelationDecisions({ candidates, decisions,
      rankingPolicyVersion: params.selection.rankingPolicyVersion,
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN }).approvedPairs;
  } catch {
    // A failed verifier cannot suppress or conflate news evidence.
    return new Set();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
