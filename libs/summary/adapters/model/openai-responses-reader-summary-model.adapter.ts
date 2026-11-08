export { resolveOpenAiResponsesReaderSummaryModelOptions } from "./openai-responses-reader-summary-options";
import { runOpenAiDailyEditor } from "./openai-responses-reader-summary-daily-editor";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";
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
  assertOpenAiReaderSummaryClaimCitationIds,
  assertOpenAiReaderSummaryDraftShape,
  extractOpenAiOutputText,
  normalizeOpenAiReaderSummaryDraft,
  parseOpenAiReaderSummaryJsonObject,
  resolveOpenAiReaderSummaryUsage,
} from "./openai-responses-reader-summary-model-support";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
  currentReaderSummaryPromptRelease,
} from "./openai-responses-reader-summary-prompt";
import { readerSummaryWriterSchema } from "./openai-responses-reader-summary-schema";
import { classifyOpenAiReaderSummaryModelError } from "./openai-responses-reader-summary-error-policy";
import { buildOpenAiReaderSummaryNoSignalAttempt } from "./openai-responses-reader-summary-no-signal";

import {
  ReaderSummaryModelProviderError,
  createOpenAiReaderSummaryResponse,
  type OpenAiReaderSummaryFetchLike as FetchLike,
} from "./openai-responses-reader-summary-transport";

export type OpenAiResponsesReaderSummaryModelAdapterOptions = {
  readonly apiKey?: string;
  readonly endpointUrl?: string;
  readonly model?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly estimatedInputCostUsdPerMillionTokens?: number;
  readonly estimatedOutputCostUsdPerMillionTokens?: number;
  readonly fetchFn?: FetchLike;
};

const provider = "openai-responses";
const defaultModel = "gpt-5.4-mini";
const defaultEvalDatasetVersion = "reader_summary.eval.mvp.v1";
const defaultEndpointUrl = "https://api.openai.com/v1/responses";
const defaultTimeoutMs = 180_000;
const defaultMaxOutputTokens = 16_000;
const defaultInputTokenDivisor = 4;

export class OpenAiResponsesReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly model: string;
  private readonly evalDatasetVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly inputTokenDivisor: number;
  private readonly estimatedInputCostUsdPerMillionTokens: number;
  private readonly estimatedOutputCostUsdPerMillionTokens: number;
  private readonly fetchFn: FetchLike;

  constructor(options: OpenAiResponsesReaderSummaryModelAdapterOptions = {}) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.endpointUrl = nonEmptyOrFallback(
      options.endpointUrl,
      defaultEndpointUrl,
    );
    this.model = nonEmptyOrFallback(options.model, defaultModel);
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
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute {
    const route = { ...this.buildRoute(), ...(input.dailyEditorialPlan !== undefined
      ? { promptVersion: "reader_summary.prompt.2026-11-03.daily_editorial_v1" }
      : input.evidence.dailyGenerationInput === undefined ? {} :
        { promptVersion: "reader_summary.prompt.2026-11-03.daily_likes_digest" }) };
    const estimate = this.estimate(input, route);

    if (
      estimate.inputTokens > policy.maxInputTokens ||
      estimate.outputTokens > policy.maxOutputTokens ||
      estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
      estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
      estimate.estimatedCostUsd > budget.remainingCostUsd
    ) {
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

    const inputTokens = Math.ceil(
      buildOpenAiReaderSummaryPromptPayload(input).length /
        this.inputTokenDivisor,
    );
    const outputTokens =
      primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
        ? 128
        : Math.min(
            this.maxOutputTokens,
            Math.max(768, input.policy.maxStories * 320),
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

  async planDaily(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ReaderSummaryDailyEditorialAttempt> {
    return runOpenAiDailyEditor({
      input, route: selectedRoute,
      maxOutputTokens: this.maxOutputTokens,
      inputTokenDivisor: this.inputTokenDivisor,
      estimatedInputCostUsdPerMillionTokens: this.estimatedInputCostUsdPerMillionTokens,
      estimatedOutputCostUsdPerMillionTokens: this.estimatedOutputCostUsdPerMillionTokens,
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

    if (this.apiKey.length === 0) {
      throw new ReaderSummaryModelProviderError({
        kind: "provider_unavailable",
        retryable: false,
        message:
          "READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY",
      });
    }

    const prompt = buildOpenAiReaderSummaryPromptPayload(input);
    const dailyGenerationReceipt = readerSummaryDailyInputReceipt(prompt, input.evidence.dailyGenerationInput, input.dailyEditorialPlan);
    const responseJson = await this.createResponse({
      model: selectedRoute.model,
      store: false,
      max_output_tokens: this.maxOutputTokens,
      instructions: buildOpenAiReaderSummaryInstructions(input),
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "social_monitor_reader_summary_artifact",
          strict: true,
          schema: readerSummaryWriterSchema(input),
        },
      },
    });
    const outputText = extractOpenAiOutputText(responseJson);

    if (outputText === undefined) {
      throw new ReaderSummaryModelProviderError({
        kind: "unsafe_or_refused",
        retryable: false,
        message: "OpenAI response did not contain reader summary output text",
      });
    }

    const rawDraft = parseOpenAiReaderSummaryJsonObject(outputText);
    assertOpenAiReaderSummaryClaimCitationIds(rawDraft);
    const usage = resolveOpenAiReaderSummaryUsage(
      responseJson,
      this.estimate(input, selectedRoute),
    );
    const draft = normalizeOpenAiReaderSummaryDraft(
      rawDraft,
      input,
      selectedRoute,
      usage,
      this.evalDatasetVersion,
    );

    return {
      route: selectedRoute,
      draft,
      ...(dailyGenerationReceipt === undefined ? {} : { dailyGenerationReceipt }),
    };
  }

  validateRawProviderResponse(
    attempt: ProviderReaderSummaryAttempt,
  ): ReaderSummaryModelValidationResult {
    try {
      assertOpenAiReaderSummaryDraftShape(attempt.draft);
      if (attempt.route.schemaVersion !== "reader_summary.artifact.v1") {
        throw new Error("Unsupported reader summary schema version");
      }
      if (attempt.route.provider !== provider) {
        throw new Error("Unexpected reader summary provider route");
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "invalid_schema",
          retryable: false,
          message:
            error instanceof Error
              ? error.message
              : "Invalid reader summary provider response",
        },
      };
    }
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return classifyOpenAiReaderSummaryModelError(error);
  }

  private buildRoute(): ReaderSummaryModelRoute {
    return {
      provider,
      model: this.model,
      promptVersion: currentReaderSummaryPromptRelease.id,
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  private buildNoSignalAttempt(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ProviderReaderSummaryAttempt {
    return buildOpenAiReaderSummaryNoSignalAttempt({
      input,
      selectedRoute,
      evalDatasetVersion: this.evalDatasetVersion,
      usage: this.estimate(input, selectedRoute),
    });
  }

  private async createResponse(
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return createOpenAiReaderSummaryResponse({
      request,
      endpointUrl: this.endpointUrl,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      fetchFn: this.fetchFn,
    });
  }
}


const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;

const nonNegativeNumberOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
