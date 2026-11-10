import {
  expandedEvidenceIds,
  sourceHydrationLimitForSelection,
} from "./openai-responses-reader-summary-expansion-policy";
import { projectReaderSummaryPromptEvidenceItem } from "./openai-responses-reader-summary-evidence-projection";
import type {
  ReaderSummaryCoveragePlan,
  SummaryEvidenceSelection,
} from "../../domain";

export const buildAdaptiveReaderSummaryEvidence = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
  citationIdByFeedItemId?: ReadonlyMap<string, string>,
): readonly Record<string, unknown>[] => {
  const expandedIds = expandedEvidenceIds(selection, coveragePlan);
  const verifiedV3PresentationIds = new Set([
    ...(selection.promotionV3?.top ?? []),
    ...(selection.promotionV3?.additional ?? []),
    ...(selection.promotionV3?.news ?? []),
  ].filter((candidate) => candidate.presentation.status === "available")
    .map((candidate) => candidate.candidateId));
  const sourceHydrationLimit = sourceHydrationLimitForSelection(selection);

  return selection.selectedEvidence.map((item, index) =>
    projectReaderSummaryPromptEvidenceItem(
      item,
      index,
      expandedIds.has(item.feedItemId),
      citationIdByFeedItemId?.get(item.feedItemId) ?? `c${index + 1}`,
      sourceHydrationLimit,
      selection.dailyGenerationInput === undefined && verifiedV3PresentationIds.has(item.feedItemId),
    ),
  );
};
