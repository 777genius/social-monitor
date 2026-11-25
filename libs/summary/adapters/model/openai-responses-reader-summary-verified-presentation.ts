import type { SummaryEvidenceItem } from "../../domain";

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
