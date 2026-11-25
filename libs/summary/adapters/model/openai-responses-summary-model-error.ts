// Compatibility for direct consumers; provider identity and error taxonomy have separate owners.
export { SummaryModelProviderError } from './openai-responses-summary-provider-error';
export { classifyOpenAiSummaryError } from './openai-responses-summary-error-classification';
export { classifyOpenAiHttpFailure, readOpenAiResponseBody } from './openai-responses-summary-http-failure';
