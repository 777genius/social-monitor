import {
  independentEvidenceProviderKeys,
  isReaderSummaryWatchEligibleEvidence,
  type ReaderSummaryCitation,
  type ReaderSummaryCoverageMode,
  type ReaderSummaryNarrativeSection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { optionalString, requiredString } from "./openai-responses-reader-summary-json";

export const watchEligibleCitationIds = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): ReadonlySet<string> => {
  const evidenceById = new Map(
    input.evidence.selectedEvidence.map(
      (evidence) => [evidence.feedItemId, evidence] as const,
    ),
  );
  const crossProviderEvidenceIds = new Set<string>();

  for (const cluster of input.evidence.clusters) {
    const clusterEvidence = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ].flatMap((feedItemId) => {
      const evidence = evidenceById.get(feedItemId);

      return evidence === undefined ? [] : [evidence];
    });

    if (independentEvidenceProviderKeys(clusterEvidence).length > 1) {
      for (const evidence of clusterEvidence) {
        crossProviderEvidenceIds.add(evidence.feedItemId);
      }
    }
  }

  return new Set(
    citationMap
      .filter((citation) => {
        const evidence = evidenceById.get(citation.feedItemId);

        return (
          evidence !== undefined &&
          isReaderSummaryWatchEligibleEvidence({
            evidence,
            crossProviderSupported: crossProviderEvidenceIds.has(
              evidence.feedItemId,
            ),
          })
        );
      })
      .map((citation) => citation.citationId),
  );
};

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

