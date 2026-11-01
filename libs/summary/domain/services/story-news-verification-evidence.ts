import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { hasIndependentNewsPublishers, storySourceTitle } from "./story-source-identity";

const lawsuitAction = /\b(?:sue[sd]?|suing)\b/iu;

/** Retrieval/verification guard only, never deterministic matching authority. */
export const hasSharedIndependentNewsLawsuitEvent = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => hasIndependentNewsPublishers(left, right) &&
  lawsuitAction.test(storySourceTitle(left)) && lawsuitAction.test(storySourceTitle(right));
