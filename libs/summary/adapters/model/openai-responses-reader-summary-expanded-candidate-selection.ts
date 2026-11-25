import type {
  ReaderSummaryCoveragePlan,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import { isTopReadEligibleEvidence } from "../../domain/policies/top-read-eligibility-policy";
import { normalizeSourceText } from "./openai-responses-reader-summary-source-normalization";

// Coverage-first, source-eligible candidate selection is independent of
// the caller's sealed daily/V3 route and of provider model execution.
const expandedCandidateLimit = 25;

export const selectHydratableExpandedEvidenceIds = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
  sourceHydrationLimit: number,
): ReadonlySet<string> => {
  const evidenceById = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const result = new Set<string>();
  const add = (feedItemId: string): void => {
    const evidence = evidenceById.get(feedItemId);
    if (
      result.size < expandedCandidateLimit &&
      evidence !== undefined &&
      normalizeSourceText(evidence.sourceText ?? evidence.bodyPreview,
        sourceHydrationLimit) !==
        undefined
    ) {
      result.add(feedItemId);
    }
  };

  for (const item of [coveragePlan.lead, ...coveragePlan.secondary]) {
    for (const feedItemId of item?.feedItemIds ?? []) {
      add(feedItemId);
    }
  }
  for (const item of [...selection.selectedEvidence].sort(compareCandidates)) {
    add(item.feedItemId);
  }

  return result;
};

const compareCandidates = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const eligibilityDifference =
    Number(isTopReadEligibleEvidence(right)) -
    Number(isTopReadEligibleEvidence(left));
  if (eligibilityDifference !== 0) {
    return eligibilityDifference;
  }
  const scoreDifference = right.score - left.score;
  return scoreDifference !== 0
    ? scoreDifference
    : right.publishedAt.getTime() - left.publishedAt.getTime();
};
