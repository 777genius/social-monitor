import { DomainError } from "@social-monitor/shared-kernel";
import {
  readerPostDisplayHeadline,
  type SummaryEvidenceItem,
} from "../../domain";

type ReaderSummaryScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

/** Apply only to policy-selected leads, never the ranking inventory. */
export const displayReadyPromotionCandidates = (
  candidates: readonly SummaryEvidenceItem[],
  scope: ReaderSummaryScope,
): readonly SummaryEvidenceItem[] => {
  const ready = candidates.filter((candidate) =>
    readerPostDisplayHeadline(candidate, scope).status === "accepted");
  if (candidates.length > 0 && ready.length === 0) {
    throw new DomainError(
      "external.dependency_unavailable",
      "Reader summary selected headlines unavailable: no selected lead has a valid display headline",
      { kind: "reader_summary_display_headlines_unavailable",
        selectedFeedItemIds: candidates.map((item) => item.feedItemId) },
    );
  }
  return ready;
};
