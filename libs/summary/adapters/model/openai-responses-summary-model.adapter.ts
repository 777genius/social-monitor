import { admitOpenAiSummaryRoute } from "./openai-responses-summary-route-admission";
import { validateOpenAiSummaryResponse } from "./openai-responses-summary-response-policy";
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
import { classifyOpenAiSummaryError } from './openai-responses-summary-model-error';
import {
  estimateOpenAiSummaryUsage,
} from "./openai-responses-summary-budget";
import {
  resolveOpenAiSummaryRuntimeSettings,
  type OpenAiSummaryRuntimeSettings,
} from './openai-responses-summary-runtime-settings';

import { runOpenAiResponsesSummaryGeneration } from './openai-responses-summary-generation';
import type { OpenAiResponsesSummaryModelAdapterOptions } from './openai-responses-summary-options';
export type { OpenAiResponsesSummaryModelAdapterOptions } from './openai-responses-summary-options';
export { resolveOpenAiResponsesSummaryModelOptions } from './openai-responses-summary-options';

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
    return admitOpenAiSummaryRoute({
      model: this.settings.model,
      promptVersion: this.settings.promptVersion,
      policy,
      budget,
      estimate: (route) => this.estimate(input, route),
    });
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

    return runOpenAiResponsesSummaryGeneration({
      input,
      selectedRoute,
      settings: this.settings,
      estimateUsage: () => this.estimate(input, selectedRoute),
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
