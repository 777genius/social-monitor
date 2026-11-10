import {
  watchEligibleCitationIds,
  fallbackNarrative,
} from "./openai-responses-reader-summary-narrative-evidence";
export { readerSummaryNarrativeMarkdown } from "./openai-responses-reader-summary-narrative-markdown";
import {
  ensureCitedLead,
  assertNarrativeCoverage,
  narrativeDiagnostics,
  canonicalNarrativeOrder,
} from "./openai-responses-reader-summary-narrative-validation";
import type {
  ReaderSummaryCitation,
  ReaderSummaryNarrativeSection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { asRecord } from "./openai-responses-reader-summary-json";
import {
  buildReaderSummaryNarrativeCitationGuard,
  buildReaderSummaryNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-coverage";
import { normalizeDailyEditorialNarrative } from "./openai-responses-reader-summary-editorial-narrative";
import { projectGroundedNarrativeSections } from "./openai-responses-reader-summary-narrative-section-projection";

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
  const sections = projectGroundedNarrativeSections({
    rawSections,
    coverage,
    knownCitationIds,
    citationsAllowed,
    legacyExecutiveSummary: params.legacyExecutiveSummary,
    storyTitlesByClusterId: params.storyTitlesByClusterId,
    storySummariesByClusterId: params.storySummariesByClusterId,
    storySummariesByCitationId: params.storySummariesByCitationId,
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

