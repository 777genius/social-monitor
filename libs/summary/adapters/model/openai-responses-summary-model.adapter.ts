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
  buildInstructions,
  buildPromptPayload,
} from './openai-responses-summary-prompt';
import {
  assertOpenAiSummaryDraftShape,
  normalizeOpenAiSummaryDraft,
} from './openai-responses-summary-draft-normalizer';
import {
  SummaryModelProviderError,
  classifyOpenAiSummaryError,
} from './openai-responses-summary-model-error';
import { extractOpenAiSummaryOutputText } from './openai-responses-summary-output-text';
import { parseOpenAiSummaryJsonObject } from './openai-responses-summary-response-parser';
import { resolveOpenAiSummaryUsage } from './openai-responses-summary-usage';
import { openAiSummaryJsonSchema } from './openai-responses-summary-schema';
import {
  assertOpenAiSummaryWithinBudget,
  estimateOpenAiSummaryUsage,
} from "./openai-responses-summary-budget";
import {
  nonEmptyOrFallback,
  nonNegativeNumberOrFallback,
  positiveIntegerOrFallback,
} from './openai-responses-summary-option-values';

import {
  createOpenAiSummaryResponse,
  type OpenAiSummaryFetchLike as FetchLike,
} from './openai-responses-summary-transport';
import type { OpenAiResponsesSummaryModelAdapterOptions } from './openai-responses-summary-options';
export type { OpenAiResponsesSummaryModelAdapterOptions } from './openai-responses-summary-options';
export { resolveOpenAiResponsesSummaryModelOptions } from './openai-responses-summary-options';

const provider = 'openai-responses';
const defaultModel = 'gpt-5.4-mini';
const defaultPromptVersion = 'summary.prompt.openai.responses.v1';
const defaultEvalDatasetVersion = 'summary.eval.mvp.v1';
const defaultEndpointUrl = 'https://api.openai.com/v1/responses';
const defaultTimeoutMs = 60_000;
const defaultMaxOutputTokens = 4_000;
const defaultInputTokenDivisor = 4;

export class OpenAiResponsesSummaryModelAdapter implements SummaryModelPort {
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly evalDatasetVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly inputTokenDivisor: number;
  private readonly estimatedInputCostUsdPerMillionTokens: number;
  private readonly estimatedOutputCostUsdPerMillionTokens: number;
  private readonly fetchFn: FetchLike;

  constructor(options: OpenAiResponsesSummaryModelAdapterOptions = {}) {
    this.apiKey = options.apiKey?.trim() ?? '';
    this.endpointUrl = nonEmptyOrFallback(
      options.endpointUrl,
      defaultEndpointUrl,
    );
    this.model = nonEmptyOrFallback(options.model, defaultModel);
    this.promptVersion = nonEmptyOrFallback(
      options.promptVersion,
      defaultPromptVersion,
    );
    this.evalDatasetVersion = nonEmptyOrFallback(
      options.evalDatasetVersion,
      defaultEvalDatasetVersion,
    );
    this.timeoutMs = positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    );
    this.maxOutputTokens = positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    );
    this.inputTokenDivisor = positiveIntegerOrFallback(
      options.inputTokenDivisor,
      defaultInputTokenDivisor,
    );
    this.estimatedInputCostUsdPerMillionTokens = nonNegativeNumberOrFallback(
      options.estimatedInputCostUsdPerMillionTokens,
      0,
    );
    this.estimatedOutputCostUsdPerMillionTokens = nonNegativeNumberOrFallback(
      options.estimatedOutputCostUsdPerMillionTokens,
      0,
    );
    this.fetchFn = options.fetchFn ?? fetch;
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
      maxOutputTokens: this.maxOutputTokens,
      inputTokenDivisor: this.inputTokenDivisor,
      estimatedInputCostUsdPerMillionTokens: this.estimatedInputCostUsdPerMillionTokens,
      estimatedOutputCostUsdPerMillionTokens: this.estimatedOutputCostUsdPerMillionTokens,
    });
  }

  async summarize(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): Promise<ProviderSummaryAttempt> {
    if (input.evidence.items.length === 0) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    if (this.apiKey.length === 0) {
      throw new SummaryModelProviderError({
        kind: 'provider_unavailable',
        retryable: false,
        message:
          'SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY',
      });
    }

    const request = {
      model: selectedRoute.model,
      store: false,
      max_output_tokens: this.maxOutputTokens,
      instructions: buildInstructions(input),
      input: buildPromptPayload(input),
      text: {
        format: {
          type: 'json_schema',
          name: 'social_monitor_summary_artifact',
          strict: true,
          schema: openAiSummaryJsonSchema,
        },
      },
    };

    const responseJson = await createOpenAiSummaryResponse({
      request,
      endpointUrl: this.endpointUrl,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      fetchFn: this.fetchFn,
    });
    const outputText = extractOpenAiSummaryOutputText(responseJson);

    if (outputText === undefined) {
      throw new SummaryModelProviderError({
        kind: 'unsafe_or_refused',
        retryable: false,
        message: 'OpenAI response did not contain summary output text',
      });
    }

    const rawDraft = parseOpenAiSummaryJsonObject(outputText);
    const usage = resolveOpenAiSummaryUsage(
      responseJson,
      this.estimate(input, selectedRoute),
    );
    const draft = normalizeOpenAiSummaryDraft(
      rawDraft,
      input,
      selectedRoute,
      usage,
      this.evalDatasetVersion,
    );

    return {
      route: selectedRoute,
      draft,
    };
  }

  validateRawProviderResponse(
    attempt: ProviderSummaryAttempt,
  ): SummaryModelValidationResult {
    try {
      assertOpenAiSummaryDraftShape(attempt.draft);

      if (attempt.route.schemaVersion !== 'summary.artifact.v1') {
        throw new Error('Unsupported summary schema version');
      }

      if (attempt.route.provider !== provider) {
        throw new Error('Unexpected summary provider route');
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: 'invalid_schema',
          retryable: false,
          message:
            error instanceof Error
              ? error.message
              : 'Invalid summary provider response',
        },
      };
    }
  }

  classifyError(error: unknown): SummaryModelFailure {
    return classifyOpenAiSummaryError(error);
  }

  private buildRoute(): SummaryModelRoute {
    return {
      provider,
      model: this.model,
      promptVersion: this.promptVersion,
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
      evalDatasetVersion: this.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }


}
