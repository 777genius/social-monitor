// Backwards-compatible direct-import surface; ownership now follows strict vs optional input policy.
export {
  requiredString,
  requiredNumber,
  requiredArray,
  requiredStringArray,
  requiredRecord,
  normalizeSetValue,
} from "./openai-responses-reader-summary-required-values";
export {
  optionalString,
  optionalArray,
  optionalStringArray,
  nonNegativeNumberOrFallback,
} from "./openai-responses-reader-summary-optional-values";
