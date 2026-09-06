import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import {
  StoryClusteringService, reconcileStoryRelationDecisions, buildReaderSummaryPeriod,
  STORY_RELATION_APPROVAL_CONFIDENCE_MIN, buildStoryRelationCandidates,
  buildBoundedStrictTitleStoryRelationCandidates, readerPostProviderFamily,
  type SummaryEvidenceSelection, type StoryRelationCandidate, type StoryRelationDecision,
} from "@social-monitor/summary/domain";
import { verifiedStoryRelationPairKey, isVerifiedStoryRelationGuardEligible } from
  "@social-monitor/summary/domain/services/story-cluster-membership";
import { STORY_RANKING_POLICY_V1 } from "@social-monitor/summary/domain/policies/story-ranking-policy";
import { verifiedReaderSummaryStoryRelations } from
  "@social-monitor/summary/adapters/evidence/relevance-reader-summary-story-relation-decisions";
import { promotionSupportCandidates, promotionPolicySelection } from
  "@social-monitor/summary/adapters/evidence/relevance-reader-summary-promotion-candidates";
import { composeReaderSummaryEditorialSlate, materializeReaderSummaryEditorialSlate } from
  "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate";
import { readerSummaryPromotionV2Candidate } from
  "@social-monitor/summary/adapters/evidence/reader-summary-editorial-candidate";
import { evaluateReaderPromotionV2 } from "@social-monitor/feed/domain";
import { NOOP_STORY_RANKING_METRICS, type ReaderSummaryStoryRelationVerifierInput } from
  "@social-monitor/summary/ports";
import { check, type Dataset, type Block } from "./dataset";

export const pairKey = (c: Pick<StoryRelationCandidate, "leftFeedItemId" | "rightFeedItemId">): string =>
  verifiedStoryRelationPairKey(c.leftFeedItemId, c.rightFeedItemId);
export const membership = (s: SummaryEvidenceSelection): Map<string, string> =>
  new Map(s.clusters.flatMap((c) => [c.representativeFeedItemId, ...c.duplicateFeedItemIds].map((id) => [id, c.id])));
export const together = (s: SummaryEvidenceSelection, left: string, right: string): boolean => {
  const m = membership(s); return m.has(left) && m.get(left) === m.get(right);
};
export const prepareBlock = async (data: Dataset, block: Block) => {
  const rows = block.postRefs.map((ref) => {
    const row = data.replayByRef.get(ref); if (!row) throw new Error(`Missing replay ${ref}`); return row;
  });
  const evidence = rows.map((r) => r.evidence);
  const cutoff = new Date(Math.max(...rows.map((r) => r.sourceWindow.ingestionCutoff.getTime())));
  check(rows.every((r) => r.sourceWindow.ingestionCutoff.getTime() === cutoff.getTime()), "Mixed original capture cutoffs");
  const period = buildReaderSummaryPeriod({
    cadence: "custom", timezone: "UTC",
    startedAt: new Date(Math.min(...rows.map((r) => r.sourceWindow.periodStartedAt.getTime()))),
    endedAt: new Date(Math.max(...rows.map((r) => r.sourceWindow.periodEndedAt.getTime()))),
  });
  const identity = {
    tenantId: tenantId("00000000-0000-4000-8000-00000000e001"),
    workspaceId: workspaceId("00000000-0000-4000-8000-00000000e002"),
    // Scope makes request ids unique per frozen evaluation block, no production scope.
    scope: { type: "interest" as const, interestId: `fixture-grouping-${block.id}` },
  };
  const clusterer = new StoryClusteringService({ now: () => cutoff });
  const clusterParams = { identity, items: evidence, limit: evidence.length, now: cutoff };
  const initial = clusterer.cluster(clusterParams);
  const promotionItems = evidence.filter((e) => e.promotionFacts !== undefined);
  const promotionIds = new Set(promotionItems.map((e) => e.feedItemId));
  const additional = promotionSupportCandidates({ evidence, clusters: initial.clusters,
    leadIds: promotionIds, promotionCandidateIds: promotionIds });
  const query = { ...identity, period, maxItems: evidence.length, observedThrough: cutoff };
  // Runs the real union/ordering of primary, strict-title and promotion-support retrieval.
  const retrieval = await verifiedReaderSummaryStoryRelations({ query, evidence,
    deterministicSelection: initial, requestedAt: cutoff, metrics: NOOP_STORY_RANKING_METRICS,
    additionalCandidates: additional });
  const primary = buildStoryRelationCandidates({ selection: initial, evidence });
  const strict = buildBoundedStrictTitleStoryRelationCandidates({ selection: initial, evidence, primaryCandidates: primary });
  const verifierInput: ReaderSummaryStoryRelationVerifierInput = {
    ...identity, period, requestedAt: cutoff, evidence, clusters: initial.clusters, candidates: retrieval.candidates,
  };
  return { block, evidence, period, cutoff, clusterer, clusterParams, initial,
    candidates: retrieval.candidates, primary, strict, additional, promotionItems, verifierInput };
};
export type PreparedBlock = Awaited<ReturnType<typeof prepareBlock>>;

export const applyDecisions = (p: PreparedBlock, decisions?: readonly unknown[]) => {
  const batch = decisions === undefined ? undefined : reconcileStoryRelationDecisions({
    candidates: p.candidates, decisions, rankingPolicyVersion: p.initial.rankingPolicyVersion,
    approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
  });
  const pairs = batch?.approvedPairs ?? new Set<string>();
  const strictIds = new Set(p.strict.map(pairKey));
  const relationSelection = p.clusterer.cluster({ ...p.clusterParams,
    verifiedStoryRelationPairs: pairs,
    verifiedStrictTitleRelationPairs: new Set([...pairs].filter((id) => strictIds.has(id))),
  });
  const relations = (batch?.traces ?? []).flatMap((t) => {
    if (!t.applied || t.confidenceScore === undefined) return [];
    const c = p.candidates.find((v) => pairKey(v) === t.pairId)!;
    // Same graduation guard as the production selector: no transitive bridge resurrection.
    return together(relationSelection, c.leftFeedItemId, c.rightFeedItemId)
      ? [{ leftFeedItemId: c.leftFeedItemId, rightFeedItemId: c.rightFeedItemId, confidence: t.confidenceScore }] : [];
  });
  const promotion = promotionPolicySelection({ ...relationSelection, approvedSameStoryRelations: relations,
    sourceWindow: { ...relationSelection.sourceWindow,
      periodStartedAt: p.period.startedAt, periodEndedAt: p.period.endedAt, ingestionCutoff: p.cutoff },
  }, p.promotionItems);
  const slate = composeReaderSummaryEditorialSlate({ selection: promotion, candidates: p.promotionItems });
  const final = materializeReaderSummaryEditorialSlate({ selection: promotion, slate });
  const admission = p.evidence.map((e) => {
    const candidate = readerSummaryPromotionV2Candidate(e, promotion);
    return { feedItemId: e.feedItemId, result: candidate ? evaluateReaderPromotionV2(candidate) : null };
  });
  return { batch, decisions, relationSelection, final, slate, admission, graduatedRelations: relations };
};
export type BlockOutcome = ReturnType<typeof applyDecisions>;

export const caseRows = async (data: Dataset, p: PreparedBlock, o: BlockOutcome) => {
  const output = [];
  for (const gold of data.cases.filter((c) => c.blockId === p.block.id)) {
    const a = data.postByRef.get(gold.left)!; const b = data.postByRef.get(gold.right)!;
    const key = verifiedStoryRelationPairKey(a.feedItemId, b.feedItemId);
    const candidate = p.candidates.find((c) => pairKey(c) === key);
    const trace = o.batch?.traces.find((t) => t.pairId === key);
    const decision = o.batch?.responseAccepted
      ? (o.decisions as readonly StoryRelationDecision[]).find((d) => pairKey(d) === key) : undefined;
    const sameProvider = readerPostProviderFamily(a.providerKey) === readerPostProviderFamily(b.providerKey);
    const isolated = await prepareBlock(data, { ...p.block, postRefs: [gold.left, gold.right] });
    const isolatedRetrieved = isolated.candidates.some((c) => pairKey(c) === key);
    const left = p.evidence.find((e) => e.feedItemId === a.feedItemId)!;
    const right = p.evidence.find((e) => e.feedItemId === b.feedItemId)!;
    const alreadyTogether = together(p.initial, a.feedItemId, b.feedItemId);
    const retrievalReason = candidate ? "retrieved"
      : alreadyTogether ? "already_deterministic_cluster"
      : sameProvider ? "same_provider_family_policy_exclusion"
      : isolatedRetrieved ? "context_or_capacity_miss"
      : isVerifiedStoryRelationGuardEligible(left, right, STORY_RANKING_POLICY_V1)
        ? "lexical_or_title_retrieval_miss" : "guard_or_title_retrieval_miss";
    output.push({ ...gold, providerPair: [a.providerKey, b.providerKey].sort().join(" / "),
      days: [a.publishedAt.slice(0, 10), b.publishedAt.slice(0, 10)],
      retrieval: { candidate: Boolean(candidate), reason: retrievalReason,
        isolatedRetrieved, deterministicTogether: alreadyTogether,
        lanes: [p.primary, p.strict, p.additional].map((lane) => lane.some((c) => pairKey(c) === key)) },
      modelRationale: decision?.rationale ?? null,
      model: trace?.sameStory ?? null, confidence: trace?.confidenceScore ?? null,
      gate: trace?.disposition ?? (candidate ? "NOT_RUN" : "NOT_REQUESTED"),
      relationTogether: together(o.relationSelection, a.feedItemId, b.feedItemId),
      publicationTogether: together(o.final, a.feedItemId, b.feedItemId),
      posts: [a, b].map((post) => ({ ref: post.ref, url: post.canonicalUrl, title: post.title,
        publishedAt: post.publishedAt, observedAt: post.observedAt,
        evidenceSha256: post.frozenEvidenceSha256, sourceTextSha256: post.sourceTextSha256,
        excerpt: (post.sourceText ?? "").slice(0, 420),
        selected: o.final.selectedEvidence.some((e) => e.feedItemId === post.feedItemId),
        admission: o.admission.find((e) => e.feedItemId === post.feedItemId)?.result,
        editorialReasons: o.slate.excluded.find((e) => e.candidateId === post.feedItemId)?.reasonCodes ?? [],
      })),
    });
  }
  return output;
};
export type CaseRow = Awaited<ReturnType<typeof caseRows>>[number];
