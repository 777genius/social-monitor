import {
  nonEmptyOrFallback,
  nonNegativeNumberOrFallback,
  positiveIntegerOrFallback,
} from './openai-responses-summary-option-values';
import type { OpenAiResponsesSummaryModelAdapterOptions } from './openai-responses-summary-options';

/**
 * Constructor-only policy. The adapter consumes a validated immutable snapshot
 * rather than owning endpoint, model and budget defaults alongside execution.
 */
export type OpenAiSummaryRuntimeSettings = Readonly<Required<OpenAiResponsesSummaryModelAdapterOptions>>;

export const resolveOpenAiSummaryRuntimeSettings = (
  options: OpenAiResponsesSummaryModelAdapterOptions,
): OpenAiSummaryRuntimeSettings => ({
  apiKey: options.apiKey?.trim() ?? '',
  endpointUrl: nonEmptyOrFallback(options.endpointUrl, 'https://api.openai.com/v1/responses'),
  model: nonEmptyOrFallback(options.model, 'gpt-5.4-mini'),
  promptVersion: nonEmptyOrFallback(options.promptVersion, 'summary.prompt.openai.responses.v1'),
  evalDatasetVersion: nonEmptyOrFallback(options.evalDatasetVersion, 'summary.eval.mvp.v1'),
  timeoutMs: positiveIntegerOrFallback(options.timeoutMs, 60_000),
  maxOutputTokens: positiveIntegerOrFallback(options.maxOutputTokens, 4_000),
  inputTokenDivisor: positiveIntegerOrFallback(options.inputTokenDivisor, 4),
  estimatedInputCostUsdPerMillionTokens: nonNegativeNumberOrFallback(
    options.estimatedInputCostUsdPerMillionTokens, 0,
  ),
  estimatedOutputCostUsdPerMillionTokens: nonNegativeNumberOrFallback(
    options.estimatedOutputCostUsdPerMillionTokens, 0,
  ),
  fetchFn: options.fetchFn ?? fetch,
});
