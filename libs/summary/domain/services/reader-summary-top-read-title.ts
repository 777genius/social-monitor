import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildReaderPostPromotionTitle } from "./reader-post-promotion-title";
import { readerPostDisplayHeadline } from "./reader-post-display-headline";

export const buildTopReadTitle = (params: {
  readonly storyTitle: string;
  readonly storySummary: string;
  readonly primaryEvidence: SummaryEvidenceItem | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
}): string => {
  // The shared/legacy builder must preserve the same lead context as promotion.
  // A generated title or a support item's text cannot replace that context.
  if (params.primaryEvidence !== undefined) {
    return evidenceReaderTitle(params.primaryEvidence);
  }
  return "";
};

export const evidenceReaderTitle = (evidence: SummaryEvidenceItem): string => {
  const headline = readerPostDisplayHeadline(evidence);
  // Source text is draft/rejection evidence only when authority is unavailable.
  return headline.status === "accepted" ? headline.text
    : buildReaderPostPromotionTitle({ lead: evidence });
};

export { isUnverifiedBreakingSourceTitle, isReaderFacingTopReadTitle, isSourceCoverageFramingText } from
  "../policies/reader-display-title-policy";
