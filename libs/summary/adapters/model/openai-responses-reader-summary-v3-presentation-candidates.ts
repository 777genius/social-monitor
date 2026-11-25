import type { SummaryEvidenceSelection } from "../../domain";

/**
 * Preserve the ordered, status-only candidate IDs admitted by the V3 promotion
 * projection. The downstream trusted presentation binder still validates each
 * source identity and evidence digest independently.
 */
export const availablePromotionV3PresentationIds = (
  selection: SummaryEvidenceSelection,
): ReadonlySet<string> =>
  new Set([
    ...(selection.promotionV3?.top ?? []),
    ...(selection.promotionV3?.additional ?? []),
    ...(selection.promotionV3?.news ?? []),
  ].filter((candidate) => candidate.presentation.status === "available")
    .map((candidate) => candidate.candidateId));
