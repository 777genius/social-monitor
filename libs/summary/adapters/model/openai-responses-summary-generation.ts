import type {
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from '../../ports';
import { buildOpenAiSummaryRequest } from './openai-responses-summary-request-contract';
import { completeOpenAiSummaryAttempt } from './openai-responses-summary-attempt-completion';
import { SummaryModelProviderError } from './openai-responses-summary-model-error';
import { createOpenAiSummaryResponse } from './openai-responses-summary-transport';
import type { OpenAiSummaryRuntimeSettings } from './openai-responses-summary-runtime-settings';

/**
 * Owns the paid ordinary-summary task lifecycle after the adapter has handled
 * the deterministic no-evidence path. No provider dispatch occurs without a key.
 */
export const runOpenAiResponsesSummaryGeneration = async (params: {
  readonly input: SummaryModelInput;
  readonly selectedRoute: SummaryModelRoute;
  readonly settings: OpenAiSummaryRuntimeSettings;
  readonly estimateUsage: () => SummaryModelEstimate;
}): Promise<ProviderSummaryAttempt> => {
  if (params.settings.apiKey.length === 0) {
    throw new SummaryModelProviderError({
      kind: 'provider_unavailable',
      retryable: false,
      message:
        'SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY',
    });
  }

  const request = buildOpenAiSummaryRequest(
    params.input,
    params.selectedRoute.model,
    params.settings.maxOutputTokens,
  );
  const responseJson = await createOpenAiSummaryResponse({
    request,
    endpointUrl: params.settings.endpointUrl,
    apiKey: params.settings.apiKey,
    timeoutMs: params.settings.timeoutMs,
    fetchFn: params.settings.fetchFn,
  });
  return completeOpenAiSummaryAttempt({
    responseJson,
    input: params.input,
    selectedRoute: params.selectedRoute,
    estimateUsage: params.estimateUsage,
    evalDatasetVersion: params.settings.evalDatasetVersion,
  });
};
