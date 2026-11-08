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
  openAiApiKeySourceDescription,
  resolveOpenAiApiKey,
} from './openai-api-key-source';
import {
  SummaryModelProviderError,
} from './openai-responses-summary-model-error';
import {
  extractOpenAiSummaryOutputText,
  parseOpenAiSummaryJsonObject,
  resolveOpenAiSummaryUsage,
} from './openai-responses-summary-response-parser';
import { openAiSummaryJsonSchema } from './openai-responses-summary-schema';
import {
  nonEmptyOrFallback,
  nonNegativeNumberOrFallback,
  parseNonNegativeNumber,
  parsePositiveInteger,
  positiveIntegerOrFallback,
} from './openai-responses-summary-json';

import {
  createOpenAiSummaryResponse,
  type OpenAiSummaryFetchLike as FetchLike,
} from './openai-responses-summary-transport';

export type OpenAiResponsesSummaryModelAdapterOptions = {
  readonly apiKey?: string;
  readonly endpointUrl?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly estimatedInputCostUsdPerMillionTokens?: number;
  readonly estimatedOutputCostUsdPerMillionTokens?: number;
  readonly fetchFn?: FetchLike;
};

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
    const estimate = this.estimate(input, route);

    if (
      estimate.inputTokens > policy.maxInputTokens ||
      estimate.outputTokens > policy.maxOutputTokens ||
      estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
      estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
      estimate.estimatedCostUsd > budget.remainingCostUsd
    ) {
      throw new SummaryModelProviderError({
        kind: 'budget_exceeded',
        retryable: false,
        message: 'Summary model budget exceeded',
      });
    }

    return route;
  }

  estimate(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): SummaryModelEstimate {
    void selectedRoute;

    const inputTokens = Math.ceil(
      buildPromptPayload(input).length / this.inputTokenDivisor,
    );
    const outputTokens =
      input.evidence.items.length === 0
        ? 96
        : Math.min(
            this.maxOutputTokens,
            Math.max(256, input.policy.maxKeyPoints * 220),
          );
    const estimatedCostUsd =
      (inputTokens * this.estimatedInputCostUsdPerMillionTokens +
        outputTokens * this.estimatedOutputCostUsdPerMillionTokens) /
      1_000_000;

    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
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
    if (error instanceof SummaryModelProviderError) {
      return error.failure;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        kind: 'provider_unavailable',
        retryable: true,
        message: 'OpenAI summary request timed out',
      };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown summary model error';
    const lower = message.toLowerCase();

    if (lower.includes('budget')) {
      return {
        kind: 'budget_exceeded',
        retryable: false,
        message,
      };
    }

    if (lower.includes('citation')) {
      return {
        kind: 'citation_validation_failed',
        retryable: false,
        message,
      };
    }

    if (lower.includes('schema') || lower.includes('json')) {
      return {
        kind: 'invalid_schema',
        retryable: false,
        message,
      };
    }

    return {
      kind: 'unknown',
      retryable: false,
      message,
    };
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

export const resolveOpenAiResponsesSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireApiKey: boolean },
): OpenAiResponsesSummaryModelAdapterOptions => {
  const apiKey = resolveOpenAiApiKey(env);

  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error(
      `SUMMARY_MODEL_PROVIDER=openai-responses requires ${openAiApiKeySourceDescription}`,
    );
  }

  return {
    apiKey,
    endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
    model: env.OPENAI_SUMMARY_MODEL,
    promptVersion: env.OPENAI_SUMMARY_PROMPT_VERSION,
    evalDatasetVersion: env.SUMMARY_EVAL_DATASET_VERSION,
    timeoutMs: parsePositiveInteger(env.OPENAI_SUMMARY_TIMEOUT_MS),
    maxOutputTokens: parsePositiveInteger(env.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS),
    estimatedInputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS,
    ),
    estimatedOutputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS,
    ),
  };
};
