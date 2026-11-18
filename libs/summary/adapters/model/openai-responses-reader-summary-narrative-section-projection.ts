import type { ReaderSummaryNarrativeSection } from "../../domain";
import { narrativeSectionText } from "./openai-responses-reader-summary-narrative-text";
import type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-coverage";
import { maxNarrativeSections } from "./openai-responses-reader-summary-narrative-validation";
import { isAdmissibleGroundedNarrativeSection } from "./openai-responses-reader-summary-narrative-section-admission";
import { decodeReaderSummaryProviderNarrativeSection } from "./openai-responses-reader-summary-narrative-provider-section";

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
      const {
        kind, authoredStoryClusterId, storyClusterId, title, citationIds,
      } = decodeReaderSummaryProviderNarrativeSection(value, params);
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
        !isAdmissibleGroundedNarrativeSection({
          kind,
          authoredStoryClusterId,
          storyClusterId,
          citationIds,
          coverage: params.coverage,
          citationsAllowed: params.citationsAllowed,
        })
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
