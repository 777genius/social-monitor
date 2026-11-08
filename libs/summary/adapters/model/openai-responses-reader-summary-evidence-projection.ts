import type { SummaryEvidenceItem } from "../../domain";
import { compactText } from "./openai-responses-reader-summary-source-content";

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

