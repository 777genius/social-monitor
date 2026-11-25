import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";

// Evidence admission is independent of the fallback headline/copy projection.
// Keep source citation order and the original three-citation bound; never
// fabricate a fallback when the frozen plan has no matching evidence.
export const plannedFallbackNarrativeCitationIds = (params: {
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}): readonly string[] => {
  const plannedFeedItemIds = new Set(
    [
      params.input.coveragePlan.lead,
      ...(params.input.coveragePlan.mode === "daily_synthesis"
        ? params.input.coveragePlan.secondary
        : []),
    ].flatMap((item) => item?.feedItemIds ?? []),
  );
  const citationIds = params.citationMap
    .filter((item) => plannedFeedItemIds.has(item.feedItemId))
    .slice(0, 3)
    .map((item) => item.citationId);
  return citationIds;
};
