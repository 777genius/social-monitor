import { buildOpenAiSummaryRequest } from "./openai-responses-summary-request-contract";
import {
  completeOpenAiSummaryAttempt,
  validateOpenAiSummaryResponse,
} from "./openai-responses-summary-response-policy";
import { buildSummaryNoSignalAttempt } from "./summary-no-signal-attempt";
import type {
  ProviderSummaryAttempt,
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelFailure,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelPort,
  SummaryModelRoute,
  SummaryModelValidationResult,
} from '../../ports';
import {
  SummaryModelProviderError,
  classifyOpenAiSummaryError,
} from './openai-responses-summary-model-error';
import {
  assertOpenAiSummaryWithinBudget,
  estimateOpenAiSummaryUsage,
} from "./openai-responses-summary-budget";
import {
  resolveOpenAiSummaryRuntimeSettings,
  type OpenAiSummaryRuntimeSettings,
} from './openai-responses-summary-runtime-settings';

import { createOpenAiSummaryResponse } from './openai-responses-summary-transport';
import type { OpenAiResponsesSummaryModelAdapterOptions } from './openai-responses-summary-options';
export type { OpenAiResponsesSummaryModelAdapterOptions } from './openai-responses-summary-options';
export { resolveOpenAiResponsesSummaryModelOptions } from './openai-responses-summary-options';

const provider = 'openai-responses';

export class OpenAiResponsesSummaryModelAdapter implements SummaryModelPort {
  private readonly settings: OpenAiSummaryRuntimeSettings;

  constructor(options: OpenAiResponsesSummaryModelAdapterOptions = {}) {
    this.settings = resolveOpenAiSummaryRuntimeSettings(options);
  }

  route(
    input: SummaryModelInput,
    policy: SummaryModelPolicy,
    budget: SummaryModelBudget,
  ): SummaryModelRoute {
    const route = this.buildRoute();
    assertOpenAiSummaryWithinBudget(this.estimate(input, route), policy, budget);
    return route;
  }

  estimate(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): SummaryModelEstimate {
    void selectedRoute;

    return estimateOpenAiSummaryUsage(input, {
      maxOutputTokens: this.settings.maxOutputTokens,
      inputTokenDivisor: this.settings.inputTokenDivisor,
      estimatedInputCostUsdPerMillionTokens: this.settings.estimatedInputCostUsdPerMillionTokens,
      estimatedOutputCostUsdPerMillionTokens: this.settings.estimatedOutputCostUsdPerMillionTokens,
    });
  }

  async summarize(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): Promise<ProviderSummaryAttempt> {
    if (input.evidence.items.length === 0) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    if (this.settings.apiKey.length === 0) {
      throw new SummaryModelProviderError({
        kind: 'provider_unavailable',
        retryable: false,
        message:
          'SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY',
      });
    }

    const request = buildOpenAiSummaryRequest(input, selectedRoute.model, this.settings.maxOutputTokens);
    const responseJson = await createOpenAiSummaryResponse({
      request,
      endpointUrl: this.settings.endpointUrl,
      apiKey: this.settings.apiKey,
      timeoutMs: this.settings.timeoutMs,
      fetchFn: this.settings.fetchFn,
    });
    return completeOpenAiSummaryAttempt({
      responseJson,
      input,
      selectedRoute,
      estimateUsage: () => this.estimate(input, selectedRoute),
      evalDatasetVersion: this.settings.evalDatasetVersion,
    });
  }

  validateRawProviderResponse(
    attempt: ProviderSummaryAttempt,
  ): SummaryModelValidationResult {
    return validateOpenAiSummaryResponse(attempt);
  }

  classifyError(error: unknown): SummaryModelFailure {
    return classifyOpenAiSummaryError(error);
  }

  private buildRoute(): SummaryModelRoute {
    return {
      provider,
      model: this.settings.model,
      promptVersion: this.settings.promptVersion,
      schemaVersion: 'summary.artifact.v1',
    };
  }

  private buildNoSignalAttempt(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): ProviderSummaryAttempt {
    return buildSummaryNoSignalAttempt({
      input,
      selectedRoute,
      evalDatasetVersion: this.settings.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }


}
