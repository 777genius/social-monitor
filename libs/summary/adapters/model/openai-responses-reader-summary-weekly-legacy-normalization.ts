import { projectLegacyWeeklyDocument } from "./openai-responses-reader-summary-weekly-document-projection";
import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  exactStringArray,
  expandedLegacyOutputKeys,
  hasExactKeys,
  legacyOutputKeys,
  sealedCompactOutputKeys,
} from "./openai-responses-reader-summary-weekly-response-shapes";
import { citedRange } from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";
import { normalizeLegacyFlatWeeklySections } from "./openai-responses-reader-summary-weekly-flat-section-normalization";
import {
  normalizeExpandedLegacyWeeklyModelOutput,
  normalizeSealedCompactWeeklyModelOutput,
} from "./openai-responses-reader-summary-weekly-expanded-normalization";

export const normalizeLegacyWeeklyModelOutput = (
  input: ReaderSummaryWeeklyModelInput,
  value: unknown,
): unknown => {
  if (hasExactKeys(value, sealedCompactOutputKeys)) {
    return normalizeSealedCompactWeeklyModelOutput(input, value);
  }
  if (hasExactKeys(value, expandedLegacyOutputKeys)) {
    return normalizeExpandedLegacyWeeklyModelOutput(input, value);
  }
  if (!hasExactKeys(value, legacyOutputKeys)) {
    return value;
  }
  if (!Array.isArray(value.citationIds) || !Array.isArray(value.sections)) {
    throw new Error("Legacy weekly output citations and sections must be arrays");
  }
  const rootCitationIds = exactStringArray(
    value.citationIds,
    "legacy weekly output citations",
  );
  const rootRange = citedRange(input, rootCitationIds);
  if (
    value.observedFrom !== rootRange.observedFrom ||
    value.observedThrough !== rootRange.observedThrough
  ) {
    throw new Error("Legacy weekly output fabricates root chronology");
  }
  const sections = normalizeLegacyFlatWeeklySections({ sections: value.sections });
  return projectLegacyWeeklyDocument(
    value,
    rootCitationIds,
    sections.map((section) => section.story),
    sections.map((section) => section.section),
  );
};
