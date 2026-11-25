import type { ReaderSummaryTopStory } from "../../domain";
import {
  optionalString,
  normalizeStringArrayLike,
} from "./openai-responses-reader-summary-json";

export const normalizeTopStory = (
  value: Record<string, unknown>,
): ReaderSummaryTopStory => {
  const storyClusterId = optionalString(value.storyClusterId) ?? "";
  const modelSummary = optionalString(value.summary) ??
    optionalString(value.description);
  const citationIds = normalizeStringArrayLike(
    value.citationIds,
    "top story citations",
  );
  return {
    storyClusterId,
    title: optionalString(value.title) ?? "Cited story",
    summary:
      modelSummary ??
      "Selected evidence supports this story.",
    interestIds: normalizeStringArrayLike(
      value.interestIds,
      "top story interests",
    ),
    providerKeys: normalizeStringArrayLike(
      value.providerKeys,
      "top story providers",
    ),
    citationIds,
    // Never read provenance supplied by the model. Keep its complete original
    // binding before unknown citations, cluster repair, or coverage completion.
    readerReasonProvenance: modelSummary === undefined
      ? { kind: "normalizer_fallback" }
      : {
          kind: "model",
          originalStoryClusterId: storyClusterId,
          originalCitationIds: [...citationIds],
          originalSummary: modelSummary,
        },
  };
};

