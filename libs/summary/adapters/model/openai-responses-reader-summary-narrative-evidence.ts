import {
  type ReaderSummaryCitation,
  type ReaderSummaryCoverageMode,
  type ReaderSummaryNarrativeSection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";

// Keep original function-object identity for direct consumers.
export { watchEligibleCitationIds } from "./openai-responses-reader-summary-watch-evidence-policy";
import { optionalString, requiredString } from "./openai-responses-reader-summary-json";

export const narrativeSectionText = (params: {
  readonly value: Record<string, unknown>;
  readonly kind: ReaderSummaryNarrativeSection["kind"] | undefined;
  readonly storyClusterId: string | undefined;
  readonly citationIds: readonly string[];
  readonly legacyExecutiveSummary: string;
  readonly storySummariesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByCitationId: ReadonlyMap<string, string>;
}): string | undefined =>
  optionalString(params.value.text) ??
  optionalString(params.value.summary) ??
  optionalString(params.value.body) ??
  optionalString(params.value.description) ??
  params.citationIds
    .map((citationId) =>
      optionalString(params.storySummariesByCitationId.get(citationId)),
    )
    .find((value): value is string => value !== undefined) ??
  (params.storyClusterId === undefined
    ? undefined
    : optionalString(
        params.storySummariesByClusterId.get(params.storyClusterId),
      )) ??
  (params.kind === "lead"
    ? optionalString(params.legacyExecutiveSummary)
    : undefined);

export const fallbackNarrative = (params: {
  readonly legacyExecutiveSummary: string;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyTitlesByClusterId: ReadonlyMap<string, string>;
}): readonly ReaderSummaryNarrativeSection[] => {
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
  if (citationIds.length === 0) {
    return [];
  }

  return [
    {
      id: "narrative-1",
      kind: "lead",
      title:
        (params.input.coveragePlan.mode === "daily_synthesis"
          ? "Daily synthesis"
          : params.input.coveragePlan.lead?.clusterId === undefined
            ? undefined
            : params.storyTitlesByClusterId.get(
                params.input.coveragePlan.lead.clusterId,
              )) ?? "Overview",
      text: requiredString(
        params.legacyExecutiveSummary,
        "reader summary executive summary",
      ),
      citationIds,
      ...(params.input.coveragePlan.mode === "daily_synthesis" ||
      params.input.coveragePlan.lead?.clusterId === undefined
        ? {}
        : { storyClusterId: params.input.coveragePlan.lead.clusterId }),
    },
  ];
};

export const defaultNarrativeTitle = (
  kind: ReaderSummaryNarrativeSection["kind"] | undefined,
  storyClusterId: string | undefined,
  storyTitlesByClusterId: ReadonlyMap<string, string>,
  coverageMode: ReaderSummaryCoverageMode,
): string | undefined => {
  switch (kind) {
    case "lead":
      if (coverageMode === "daily_synthesis") {
        return "Daily synthesis";
      }
      return (
        (storyClusterId === undefined
          ? undefined
          : storyTitlesByClusterId.get(storyClusterId)) ?? "Overview"
      );
    case "main_signal":
      return "Main signal";
    case "why_it_matters":
      return "Why it matters";
    case "watch":
      return "Watch";
    case "secondary_signal":
      return storyClusterId === undefined
        ? undefined
        : storyTitlesByClusterId.get(storyClusterId);
    case undefined:
      return undefined;
  }
};

