import type { ReaderSummaryCitation, ReaderSummaryNextAction } from "../../domain";
import { nextActionKinds } from "./openai-responses-reader-summary-json-schema";
import { normalizeSetValue, requiredString, requiredStringArray } from "./openai-responses-reader-summary-parsers";
import { findTrustedReaderCitation } from "./openai-responses-reader-summary-citation-binding";

// Provider action fields are admitted here; only a trusted citation grants a source URL.
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
