// Preserve legacy entrypoint and function identity while keeping the independent
// lead, coverage, diagnostics and ordering policies in their own owners.
export { ensureCitedLead } from "./openai-responses-reader-summary-narrative-lead-admission";
export {
  validSecondarySection,
  assertNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-secondary-coverage";
export { narrativeDiagnostics } from "./openai-responses-reader-summary-narrative-diagnostics";
export {
  maxNarrativeSections,
  canonicalNarrativeOrder,
} from "./openai-responses-reader-summary-narrative-order";
