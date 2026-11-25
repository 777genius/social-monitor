import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { exactStringArray } from "./openai-responses-reader-summary-weekly-response-shapes";

// Compatibility: existing consumers retain the identical exported function objects.
export { exactLegacyClaimType, legacyClaimTypeFromStories } from "./openai-responses-reader-summary-weekly-legacy-claim-policy";

// The legacy evidence trust policy owns citation chronology and claim provenance.

export const exactLegacyCitationRange = (
  input: ReaderSummaryWeeklyModelInput,
  value: Readonly<Record<string, unknown>>,
  label: string,
): string[] => {
  if (!Array.isArray(value.citationIds)) {
    throw new Error(`${label} citations must be an array`);
  }
  const citationIds = exactStringArray(value.citationIds, `${label} citations`);
  const range = citedRange(input, citationIds);
  if (
    value.observedFrom !== range.observedFrom ||
    value.observedThrough !== range.observedThrough
  ) {
    throw new Error(`${label} fabricates chronology`);
  }
  return citationIds;
};

export const citedRange = (
  input: ReaderSummaryWeeklyModelInput,
  citationIds: readonly string[],
): { observedFrom: string; observedThrough: string } => {
  const citationById = new Map(
    input.citations.map((citation) => [citation.citationId, citation] as const),
  );
  const dates = citationIds.map((citationId) => {
    const citation = citationById.get(citationId);
    if (citation === undefined) {
      throw new Error("Legacy weekly output cites unknown evidence");
    }
    return citation.observedOn;
  });
  dates.sort();
  return {
    observedFrom: dates[0]!,
    observedThrough: dates[dates.length - 1]!,
  };
};
