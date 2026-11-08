import {
  adaptiveSourceContent,
  normalizeSourceText,
  compactText,
} from "./openai-responses-reader-summary-source-content";
import {
  acceptedReaderPresentation,
  compactConversationContext,
  compactStringArray,
} from "./openai-responses-reader-summary-evidence-projection";
import type {
  ReaderSummaryCoveragePlan,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import { isTopReadEligibleEvidence } from "../../domain/policies/top-read-eligibility-policy";

const baselineTextLimit = 600;
const expandedCandidateLimit = 25;
const legacySourceHydrationLimit = 50_000;
const v3SourceHydrationLimit = 64_000;

export const buildAdaptiveReaderSummaryEvidence = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
  citationIdByFeedItemId?: ReadonlyMap<string, string>,
): readonly Record<string, unknown>[] => {
  const expandedIds = expandedEvidenceIds(selection, coveragePlan);
  const verifiedV3PresentationIds = new Set([
    ...(selection.promotionV3?.top ?? []),
    ...(selection.promotionV3?.additional ?? []),
    ...(selection.promotionV3?.news ?? []),
  ].filter((candidate) => candidate.presentation.status === "available")
    .map((candidate) => candidate.candidateId));
  const sourceHydrationLimit = selection.promotionV3 === undefined && selection.dailyGenerationInput === undefined
    ? legacySourceHydrationLimit : v3SourceHydrationLimit;

  return selection.selectedEvidence.map((item, index) =>
    promptEvidenceItem(
      item,
      index,
      expandedIds.has(item.feedItemId),
      citationIdByFeedItemId?.get(item.feedItemId) ?? `c${index + 1}`,
      sourceHydrationLimit,
      selection.dailyGenerationInput === undefined && verifiedV3PresentationIds.has(item.feedItemId),
    ),
  );
};

const expandedEvidenceIds = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
): ReadonlySet<string> => {
  if (selection.dailyGenerationInput !== undefined) return new Set(selection.dailyGenerationInput.selected.map(entry => entry.feedItemId));
  const evidenceById = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const result = new Set<string>();
  const add = (feedItemId: string): void => {
    const evidence = evidenceById.get(feedItemId);
    if (
      result.size < expandedCandidateLimit &&
      evidence !== undefined &&
      normalizeSourceText(evidence.sourceText ?? evidence.bodyPreview,
        selection.promotionV3 === undefined ? legacySourceHydrationLimit :
          v3SourceHydrationLimit) !==
        undefined
    ) {
      result.add(feedItemId);
    }
  };

  for (const item of [coveragePlan.lead, ...coveragePlan.secondary]) {
    for (const feedItemId of item?.feedItemIds ?? []) {
      add(feedItemId);
    }
  }
  for (const item of [...selection.selectedEvidence].sort(compareCandidates)) {
    add(item.feedItemId);
  }

  return result;
};

const compareCandidates = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const eligibilityDifference =
    Number(isTopReadEligibleEvidence(right)) -
    Number(isTopReadEligibleEvidence(left));
  if (eligibilityDifference !== 0) {
    return eligibilityDifference;
  }
  const scoreDifference = right.score - left.score;
  return scoreDifference !== 0
    ? scoreDifference
    : right.publishedAt.getTime() - left.publishedAt.getTime();
};

const promptEvidenceItem = (
  item: SummaryEvidenceItem,
  index: number,
  expanded: boolean,
  citationId: string,
  sourceHydrationLimit: number,
  verifiedV3Presentation: boolean,
): Record<string, unknown> => {
  const baselineSource = item.sourceText ?? item.bodyPreview;

  return {
    index: index + 1,
    citationId,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    evidenceTier: expanded ? "expanded_candidate" : "baseline",
    title: compactText(item.title, baselineTextLimit),
    bodyPreview:
      baselineSource === undefined
        ? undefined
        : compactText(baselineSource, baselineTextLimit),
    sourceContent: expanded ? adaptiveSourceContent(item, sourceHydrationLimit) : undefined,
    acceptedReaderPresentation: verifiedV3Presentation
      ? acceptedReaderPresentation(item) : undefined,
    canonicalUrl: item.canonicalUrl,
    authorHandle: item.authorHandle,
    publishedAt: item.publishedAt.toISOString(),
    observedAt: item.observedAt.toISOString(),
    score: item.score,
    providerMetrics: item.providerMetricLabels?.slice(0, 8),
    whyImportant: compactStringArray(item.whyImportant, 3, 160),
    contentQuality:
      item.contentQuality === undefined
        ? undefined
        : {
            decision: item.contentQuality.decision,
            reason: compactText(item.contentQuality.reason, 140),
            flags: item.contentQuality.flags.slice(0, 6),
            eligibleForTopRead: item.contentQuality.eligibleForTopRead,
            qualityScore: item.contentQuality.qualityScore,
            interestRelevanceScore: item.contentQuality.interestRelevanceScore,
            engagementIntegrityScore:
              item.contentQuality.engagementIntegrityScore,
          },
    conversationContext:
      item.conversationContext === undefined
        ? undefined
        : compactConversationContext(item.conversationContext),
  };
};

