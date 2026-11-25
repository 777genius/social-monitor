// Compatibility entrypoint; the untrusted JSON-object boundary is owned separately.
export { extractOpenAiOutputText } from "./openai-responses-reader-summary-output-text";
export { assertOpenAiReaderSummaryClaimCitationIds } from "./openai-responses-reader-summary-claim-citations";
export { resolveOpenAiReaderSummaryUsage } from "./openai-responses-reader-summary-usage";
export {
  parseOpenAiReaderSummaryJsonObject,
  OpenAiReaderSummaryOutputParseError,
} from "./openai-responses-reader-summary-output-json-admission";
