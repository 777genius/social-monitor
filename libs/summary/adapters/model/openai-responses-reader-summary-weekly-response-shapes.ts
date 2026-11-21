// Historical weekly wire-vocabulary entrypoint; keep public symbols identical.
export {
  legacyOutputKeys,
  expandedLegacyOutputKeys,
  expandedLegacyStoryKeys,
  expandedLegacySectionKeys,
  expandedLegacySectionKeysWithoutClaimType,
  legacySectionKeys,
  legacySectionKeysWithoutTakeaway,
} from "./openai-responses-reader-summary-weekly-legacy-shape-keys";
export {
  sealedCompactOutputKeys,
  sealedCompactStoryKeys,
  sealedCompactStoryKeysWithHeadline,
} from "./openai-responses-reader-summary-weekly-sealed-shape-keys";

// Response shape vocabulary for the weekly model output parser.














export {
  normalizeExpandedLegacyStoryStatus,
  normalizeExpandedLegacySectionKind,
  normalizeLegacySectionKind,
  normalizeLegacyStoryStatus,
} from "./openai-responses-reader-summary-weekly-legacy-compatibility";
export {
  hasExactKeys,
  exactStringArray,
  assertFiniteDenseJson,
} from "./openai-responses-reader-summary-weekly-shape-validation";
