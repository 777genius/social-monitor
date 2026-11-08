import {
  watchEligibleCitationIds,
  narrativeSectionText,
  fallbackNarrative,
  defaultNarrativeTitle,
} from "./openai-responses-reader-summary-narrative-evidence";
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

