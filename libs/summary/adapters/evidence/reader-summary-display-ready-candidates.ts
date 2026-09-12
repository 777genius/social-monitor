import {
  readerPostDisplayHeadline,
  type SummaryEvidenceItem,
} from "../../domain";

type ReaderSummaryScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

/**
 * Exclude invalid display evidence before editorial selection. A wholly
 * unavailable batch leaves the slate empty for honest NO_SIGNAL behavior.
 */
export const displayReadyPromotionCandidates = (
  candidates: readonly SummaryEvidenceItem[],
  scope: ReaderSummaryScope,
): readonly SummaryEvidenceItem[] => {
  return candidates.filter((candidate) =>
    readerPostDisplayHeadline(candidate, scope).status === "accepted");
};
