import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { asRecord } from "./openai-responses-reader-summary-json";
import { watchEligibleCitationIds } from "./openai-responses-reader-summary-watch-evidence-policy";
import {
  buildReaderSummaryNarrativeCitationGuard,
  buildReaderSummaryNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-coverage";

// Admission owns untrusted record shape, required coverage and citation trust.
// An absent, secondary-free narrative still uses the historical fallback path.
export const admitOpenAiReaderSummaryNarrativeInput = (params: {
  readonly rawSections: unknown;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}) => {
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
    return { kind: "fallback" as const };
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
  return {
    kind: "grounded" as const,
    rawSections,
    knownCitationIds,
    coverage,
    citationsAllowed,
  };
};
