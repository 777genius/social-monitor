import {
  readerPostDisplayHeadline,
  type SummaryEvidenceItem,
} from "../../domain";

type ReaderSummaryScope = Readonly<{
  tenantId: string;
  workspaceId: string;
}>;

/**
 * Keep invalid display evidence out of an otherwise publishable slate. If the
 * whole batch is unavailable, preserve it so the publication gate reports the
 * outage instead of silently turning a real-news day into NO_SIGNAL.
 */
export const displayReadyPromotionCandidates = (
  candidates: readonly SummaryEvidenceItem[],
  scope: ReaderSummaryScope,
): readonly SummaryEvidenceItem[] => {
  const ready = candidates.filter((candidate) =>
    readerPostDisplayHeadline(candidate, scope).status === "accepted");
  return ready.length === 0 ? candidates : ready;
};
