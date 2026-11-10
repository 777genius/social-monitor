import type {
  ReaderSummaryCoveragePlan,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import { isTopReadEligibleEvidence } from "../../domain/policies/top-read-eligibility-policy";
import { normalizeSourceText } from "./openai-responses-reader-summary-source-content";

const expandedCandidateLimit = 25;
const legacySourceHydrationLimit = 50_000;
const v3SourceHydrationLimit = 64_000;

// The legacy pack hydrates less text than the V3/daily pack. Do not
// apply the legacy candidate cap to an already sealed daily selection.
export const sourceHydrationLimitForSelection = (
  selection: SummaryEvidenceSelection,
): number =>
  selection.promotionV3 === undefined && selection.dailyGenerationInput === undefined
    ? legacySourceHydrationLimit : v3SourceHydrationLimit;

export const expandedEvidenceIds = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
): ReadonlySet<string> => {
  if (selection.dailyGenerationInput !== undefined) return new Set(selection.dailyGenerationInput.selected.map(entry => entry.feedItemId));
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
        selection.promotionV3 === undefined ? legacySourceHydrationLimit :
          v3SourceHydrationLimit) !==
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
