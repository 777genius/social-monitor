import { readerSummaryNarrativeSectionKinds, type ReaderSummaryNarrativeSection } from "../../domain";
import {
  knownStringSubset,
  normalizeSetValue,
  optionalString,
  requiredStringArray,
} from "./openai-responses-reader-summary-json";
import { defaultNarrativeTitle, narrativeSectionText } from "./openai-responses-reader-summary-narrative-evidence";
import {
  isValidReaderSummaryNarrativeLead,
  type ReaderSummaryNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-coverage";
import {
  maxNarrativeSections,
  validSecondarySection,
} from "./openai-responses-reader-summary-narrative-validation";

const narrativeKinds = new Set(readerSummaryNarrativeSectionKinds);

// Translate untrusted provider sections into grounded, bounded candidates.
// Global lead/secondary completeness and deterministic fallback remain the
// caller's responsibility, after the provider sections have been filtered.
export const projectGroundedNarrativeSections = (params: {
  readonly rawSections: readonly Record<string, unknown>[];
  readonly coverage: ReaderSummaryNarrativeCoverage;
  readonly knownCitationIds: ReadonlySet<string>;
  readonly citationsAllowed: (
    kind: ReaderSummaryNarrativeSection["kind"] | undefined,
    citationIds: readonly string[],
  ) => boolean;
  readonly legacyExecutiveSummary: string;
  readonly storyTitlesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByClusterId: ReadonlyMap<string, string>;
  readonly storySummariesByCitationId: ReadonlyMap<string, string>;
}): readonly ReaderSummaryNarrativeSection[] => {
  return params.rawSections
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
          ? params.coverage.mode === "daily_synthesis"
            ? undefined
            : (params.coverage.leadClusterId ?? authoredStoryClusterId)
          : authoredStoryClusterId;
      const title =
        optionalString(value.title) ??
        defaultNarrativeTitle(
          kind,
          storyClusterId,
          params.storyTitlesByClusterId,
          params.coverage.mode,
        );
      const citationIds = knownStringSubset(
        requiredStringArray(
          value.citationIds ?? [],
          "reader summary narrative citations",
        ),
        params.knownCitationIds,
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
        params.coverage.mode === "single_story" &&
        authoredStoryClusterId !== undefined &&
        authoredStoryClusterId !== params.coverage.leadClusterId
      ) {
        return [];
      }
      if (!params.citationsAllowed(kind, citationIds)) {
        return [];
      }
      if (
        kind === "secondary_signal" &&
        !validSecondarySection(
          storyClusterId,
          citationIds,
          params.coverage.secondaryCitationIds,
        )
      ) {
        return [];
      }
      if (
        kind === "lead" &&
        !isValidReaderSummaryNarrativeLead(citationIds, params.coverage)
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
};
