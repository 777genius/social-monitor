import { fallbackNarrative } from "./openai-responses-reader-summary-narrative-fallback";
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
import { normalizeDailyEditorialNarrative } from "./openai-responses-reader-summary-editorial-narrative";
import { projectGroundedNarrativeSections } from "./openai-responses-reader-summary-narrative-section-projection";
import { admitOpenAiReaderSummaryNarrativeInput } from "./openai-responses-reader-summary-narrative-input-admission";

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
  const admission = admitOpenAiReaderSummaryNarrativeInput(params);
  if (admission.kind === "fallback") {
    return fallbackNarrative(params);
  }
  const { rawSections, knownCitationIds, coverage, citationsAllowed } = admission;
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

