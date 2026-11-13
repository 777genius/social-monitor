import type { ReaderSummaryCitation, ReaderSummaryInterestSection, ReaderSummaryNextAction } from "../../domain";
import { nextActionKinds } from "./openai-responses-reader-summary-json-schema";
import { normalizeSetValue, optionalString, requiredArray, requiredString, requiredStringArray } from "./openai-responses-reader-summary-parsers";
import { findTrustedReaderCitation } from "./openai-responses-reader-summary-citation-binding";
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

export const normalizeNextAction = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryNextAction => {
  const citationIds = requiredStringArray(
    value.citationIds,
    "next action citations",
  );
  const trustedCitation = findTrustedReaderCitation(citationIds, citationById);

  return {
    kind:
      normalizeSetValue(value.kind, nextActionKinds, "next action kind") ??
      "read_source",
    label: requiredString(value.label, "next action label"),
    reason: requiredString(value.reason, "next action reason"),
    citationIds,
    canonicalUrl: trustedCitation?.canonicalUrl,
  };
};
