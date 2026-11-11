import { withReaderSummaryInputPromptVersion } from "./reader-summary-input-prompt-route";
import {
  estimateReaderSummaryTokenUsage,
  isReaderSummaryBudgetExceeded,
} from "./reader-summary-token-budget";
export { resolveOpenAiResponsesReaderSummaryModelOptions } from "./openai-responses-reader-summary-options";
import { runOpenAiDailyEditor } from "./openai-responses-reader-summary-daily-editor";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";
import { buildOpenAiReaderSummaryResponseRequest } from "./openai-responses-reader-summary-response-request";
import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
  ProviderReaderSummaryAttempt,
  ReaderSummaryDailyEditorialAttempt,
} from "../../ports";
import { primaryReaderSummaryEvidence } from "../../domain";
import {
  completeOpenAiReaderSummaryAttempt,
  validateOpenAiReaderSummaryResponse,
} from "./openai-responses-reader-summary-response-policy";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
  currentReaderSummaryPromptRelease,
} from "./openai-responses-reader-summary-prompt";
import { readerSummaryWriterSchema } from "./openai-responses-reader-summary-schema";
import { classifyOpenAiReaderSummaryModelError } from "./openai-responses-reader-summary-error-policy";
import { buildReaderSummaryNoSignalAttempt } from "./reader-summary-no-signal-attempt";

import {
  ReaderSummaryModelProviderError,
  createOpenAiReaderSummaryResponse,
} from "./openai-responses-reader-summary-transport";

import {
  resolveOpenAiReaderSummarySettings,
  type OpenAiReaderSummarySettings,
  type OpenAiResponsesReaderSummaryModelAdapterOptions,
} from "./openai-responses-reader-summary-runtime-settings";
export type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-runtime-settings";

const provider = "openai-responses";
export class OpenAiResponsesReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  private readonly settings: OpenAiReaderSummarySettings;

  constructor(options: OpenAiResponsesReaderSummaryModelAdapterOptions = {}) {
    this.settings = resolveOpenAiReaderSummarySettings(options);
  }

  route(
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute {
    const route = withReaderSummaryInputPromptVersion(this.buildRoute(), input);
    const estimate = this.estimate(input, route);
    if (isReaderSummaryBudgetExceeded(estimate, policy, budget)) {
      throw new ReaderSummaryModelProviderError({
        kind: "budget_exceeded",
        retryable: false,
        message: "Reader summary model budget exceeded",
      });
    }

    return route;
  }

  estimate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ReaderSummaryModelEstimate {
    void selectedRoute;
    return estimateReaderSummaryTokenUsage(input, {
      inputTokenDivisor: this.settings.inputTokenDivisor,
      maxOutputTokens: this.settings.maxOutputTokens,
      pricing: {
        inputPerMillionUsd: this.settings.estimatedInputCostUsdPerMillionTokens,
        outputPerMillionUsd: this.settings.estimatedOutputCostUsdPerMillionTokens,
      },
    });
  }

  async planDaily(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ReaderSummaryDailyEditorialAttempt> {
    return runOpenAiDailyEditor({
      input, route: selectedRoute,
      maxOutputTokens: this.settings.maxOutputTokens,
      inputTokenDivisor: this.settings.inputTokenDivisor,
      estimatedInputCostUsdPerMillionTokens: this.settings.estimatedInputCostUsdPerMillionTokens,
      estimatedOutputCostUsdPerMillionTokens: this.settings.estimatedOutputCostUsdPerMillionTokens,
      createResponse: (request) => this.createResponse(request),
    });
  }

  async generate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    if (
      primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
    ) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    if (this.settings.apiKey.length === 0) {
      throw new ReaderSummaryModelProviderError({
        kind: "provider_unavailable",
        retryable: false,
        message:
          "READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY",
      });
    }

    const prompt = buildOpenAiReaderSummaryPromptPayload(input);
    const dailyGenerationReceipt = readerSummaryDailyInputReceipt(prompt, input.evidence.dailyGenerationInput, input.dailyEditorialPlan);
    const responseJson = await this.createResponse(
      buildOpenAiReaderSummaryResponseRequest({
        model: selectedRoute.model,
        maxOutputTokens: this.settings.maxOutputTokens,
        instructions: buildOpenAiReaderSummaryInstructions(input),
        prompt,
        schema: readerSummaryWriterSchema(input),
      }),
    );
    return completeOpenAiReaderSummaryAttempt({
      responseJson,
      input,
      selectedRoute,
      estimateUsage: () => this.estimate(input, selectedRoute),
      evalDatasetVersion: this.settings.evalDatasetVersion,
      dailyGenerationReceipt,
    });
  }

  validateRawProviderResponse(
    attempt: ProviderReaderSummaryAttempt,
  ): ReaderSummaryModelValidationResult {
    return validateOpenAiReaderSummaryResponse(attempt);
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return classifyOpenAiReaderSummaryModelError(error);
  }

  private buildRoute(): ReaderSummaryModelRoute {
    return {
      provider,
      model: this.settings.model,
      promptVersion: currentReaderSummaryPromptRelease.id,
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  private buildNoSignalAttempt(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ProviderReaderSummaryAttempt {
    return buildReaderSummaryNoSignalAttempt({
      input,
      selectedRoute,
      evalDatasetVersion: this.settings.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }

  private async createResponse(
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return createOpenAiReaderSummaryResponse({
      request,
      endpointUrl: this.settings.endpointUrl,
      apiKey: this.settings.apiKey,
      timeoutMs: this.settings.timeoutMs,
      fetchFn: this.settings.fetchFn,
    });
  }
}
