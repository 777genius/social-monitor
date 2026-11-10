import type { SummaryEvidenceItem } from "../../domain";
import { adaptiveSourceContent, compactText } from "./openai-responses-reader-summary-source-content";

export const acceptedReaderPresentation = (
  item: SummaryEvidenceItem,
): Record<string, unknown> | undefined => {
  const headline = item.readerHeadline;
  if (headline?.status !== "accepted" ||
      headline.binding.candidateId !== item.feedItemId) return undefined;
  return {
    headline: headline.text,
    kind: headline.kind,
    support: headline.support,
    qualifications: headline.qualifications,
    qualificationJudgment: headline.wholeInput.qualificationJudgment,
    reviewedBodyLength: headline.wholeInput.bodyLength,
  };
};

export const compactConversationContext = (
  context: NonNullable<SummaryEvidenceItem["conversationContext"]>,
) => ({
  rankingBasis: context.rankingBasis,
  bundleScore: context.bundleScore,
  units: context.units.slice(0, 5).map((unit) => ({
    providerUnitId: unit.providerUnitId,
    authorHandle: unit.authorHandle,
    body: compactText(unit.body, 320),
    score: unit.score,
    providerScore: unit.providerScore,
    replyCount: unit.replyCount,
    signalBand: unit.signalBand,
    depth: unit.depth,
    role: unit.role,
    selectionReason: unit.selectionReason,
    ancestry: unit.ancestry?.slice(0, 2).map((ancestor) => ({
      providerUnitId: ancestor.providerUnitId,
      authorHandle: ancestor.authorHandle,
      body: compactText(ancestor.body, 220),
      score: ancestor.score,
      providerScore: ancestor.providerScore,
      replyCount: ancestor.replyCount,
      signalBand: ancestor.signalBand,
      depth: ancestor.depth,
      role: ancestor.role,
      selectionReason: ancestor.selectionReason,
    })),
  })),
});

export const compactStringArray = (
  values: readonly string[],
  maxItems: number,
  maxLength: number,
): readonly string[] =>
  values.slice(0, maxItems).map((value) => compactText(value, maxLength));


const baselineTextLimit = 600;

export const projectReaderSummaryPromptEvidenceItem = (
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
