export { readerSummaryNarrativeMarkdown } from "./openai-responses-reader-summary-narrative-markdown";
import {
  maxNarrativeSections,
  ensureCitedLead,
  validSecondarySection,
  assertNarrativeCoverage,
  narrativeDiagnostics,
  canonicalNarrativeOrder,
} from "./openai-responses-reader-summary-narrative-validation";
import {
  independentEvidenceProviderKeys,
  isReaderSummaryWatchEligibleEvidence,
  readerSummaryNarrativeSectionKinds,
  type ReaderSummaryCitation,
  type ReaderSummaryNarrativeSection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import {
  asRecord,
  knownStringSubset,
  normalizeSetValue,
  optionalString,
  requiredString,
  requiredStringArray,
} from "./openai-responses-reader-summary-json";
import {
  buildReaderSummaryNarrativeCitationGuard,
  buildReaderSummaryNarrativeCoverage,
  isValidReaderSummaryNarrativeLead,
} from "./openai-responses-reader-summary-narrative-coverage";
import { normalizeDailyEditorialNarrative } from "./openai-responses-reader-summary-editorial-narrative";
const narrativeKinds = new Set(readerSummaryNarrativeSectionKinds);

export const normalizeOpenAiReaderSummaryNarrative = (params: {
  readonly rawSections: unknown;
  readonly legacyExecutiveSummary: string;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyTitlesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByCitationId: ReadonlyMap<string, string>;
}): readonly ReaderSummaryNarrativeSection[] => {
  if (params.input.dailyEditorialPlan !== undefined) {
    return normalizeDailyEditorialNarrative(params);
  }
  const rawSections = Array.isArray(params.rawSections)
    ? params.rawSections
        .map(asRecord)
        .filter((value): value is Record<string, unknown> => value !== null)
    : [];
  if (rawSections.length === 0) {
    if (params.input.coveragePlan.secondary.length > 0) {
      throw new Error(
        "Reader summary narrative must include the planned cited lead and secondary signals",
      );
    }
    return fallbackNarrative(params);
  }

  const knownCitationIds = new Set(
    params.citationMap.map((citation) => citation.citationId),
  );
  const coverage = buildReaderSummaryNarrativeCoverage(
    params.input,
    params.citationMap,
  );
  const eligibleWatchCitationIds = watchEligibleCitationIds(
    params.input,
    params.citationMap,
  );
  const citationsAllowed = buildReaderSummaryNarrativeCitationGuard(
    coverage,
    eligibleWatchCitationIds,
  );
  const sections = rawSections
    .slice(0, maxNarrativeSections)
    .flatMap((value, index): readonly ReaderSummaryNarrativeSection[] => {
      const kind = normalizeSetValue(
        value.kind,
        narrativeKinds,
        "reader summary narrative kind",
      );
      const authoredStoryClusterId = optionalString(value.storyClusterId);
      const storyClusterId =
        kind === "lead"
          ? coverage.mode === "daily_synthesis"
            ? undefined
            : (coverage.leadClusterId ?? authoredStoryClusterId)
          : authoredStoryClusterId;
      const title =
        optionalString(value.title) ??
        defaultNarrativeTitle(
          kind,
          storyClusterId,
          params.storyTitlesByClusterId,
          coverage.mode,
        );
      const citationIds = knownStringSubset(
        requiredStringArray(
          value.citationIds ?? [],
          "reader summary narrative citations",
        ),
        knownCitationIds,
      ).slice(0, 3);
      const text = narrativeSectionText({
        value,
        kind,
        storyClusterId,
        citationIds,
        legacyExecutiveSummary: params.legacyExecutiveSummary,
        storySummariesByClusterId: params.storySummariesByClusterId,
        storySummariesByCitationId: params.storySummariesByCitationId,
      });
      if (
        kind === undefined ||
        text === undefined ||
        title === undefined ||
        citationIds.length === 0
      ) {
        return [];
      }
      if (
        kind === "lead" &&
        coverage.mode === "single_story" &&
        authoredStoryClusterId !== undefined &&
        authoredStoryClusterId !== coverage.leadClusterId
      ) {
        return [];
      }
      if (!citationsAllowed(kind, citationIds)) {
        return [];
      }
      if (
        kind === "secondary_signal" &&
        !validSecondarySection(
          storyClusterId,
          citationIds,
          coverage.secondaryCitationIds,
        )
      ) {
        return [];
      }
      if (
        kind === "lead" &&
        !isValidReaderSummaryNarrativeLead(citationIds, coverage)
      ) {
        return [];
      }

      return [
        {
          id: `narrative-${index + 1}`,
          kind,
          title,
          text,
          citationIds,
          ...(storyClusterId === undefined ? {} : { storyClusterId }),
        },
      ];
    });
  const bounded = canonicalNarrativeOrder(
    ensureCitedLead(sections, coverage, params.storyTitlesByClusterId),
  );
  assertNarrativeCoverage(
    bounded,
    coverage.secondaryCitationIds,
    narrativeDiagnostics({
      rawSections,
      validSections: sections,
      knownCitationIds,
      leadCitationIds: coverage.allowedLeadCitationIds,
    }),
  );

  return bounded;
};

const watchEligibleCitationIds = (
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

const narrativeSectionText = (params: {
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

const fallbackNarrative = (params: {
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

const defaultNarrativeTitle = (
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

