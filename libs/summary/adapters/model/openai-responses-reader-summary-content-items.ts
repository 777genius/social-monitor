import type { ReaderSummaryCitation, ReaderSummaryInterestSection } from "../../domain";
import { optionalString, requiredArray, requiredString, requiredStringArray } from "./openai-responses-reader-summary-parsers";
import { normalizeReaderItem } from "./openai-responses-reader-summary-item-normalization";

// Preserve the existing item entrypoint for direct consumers.
export { normalizeReaderItem } from "./openai-responses-reader-summary-item-normalization";

export const normalizeReaderInterestSection = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryInterestSection => ({
  interestId: optionalString(value.interestId),
  title: requiredString(value.title, "reader interest title"),
  insight: requiredString(value.insight, "reader interest insight"),
  items: requiredArray<Record<string, unknown>>(
    value.items,
    "reader interest items",
  ).map((item) => normalizeReaderItem(item, citationById)),
  citationIds: requiredStringArray(value.citationIds, "reader interest citations"),
});

// Preserve the legacy entrypoint as the identical runtime function object.
export { normalizeNextAction } from "./openai-responses-reader-summary-next-action-normalization";
