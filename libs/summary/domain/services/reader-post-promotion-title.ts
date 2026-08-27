import type { SummaryEvidenceItem } from
  "../value-objects/summary-evidence-item";
import { isUnpolishedReaderTitle } from
  "../policies/reader-summary-reader-facing-text-policy";
import { buildTopReadTitle } from "./reader-summary-top-read-title";

export const buildReaderPostPromotionTitle = (params: {
  readonly lead: SummaryEvidenceItem;
  readonly admitted?: readonly SummaryEvidenceItem[];
  readonly promotionReasons?: readonly string[];
}): string => buildTopReadTitle({
  storyTitle: params.lead.title,
  storySummary: [
    params.lead.bodyPreview,
    ...(params.promotionReasons ?? []),
    ...params.lead.whyImportant,
  ].find((value) => value?.trim().length !== 0) ?? params.lead.title,
  primaryEvidence: params.lead,
  evidence: params.admitted ?? [params.lead],
});

export const hasReaderFacingPromotionTitle = (
  item: SummaryEvidenceItem,
): boolean => !isUnpolishedReaderTitle(
  buildReaderPostPromotionTitle({ lead: item }),
);
