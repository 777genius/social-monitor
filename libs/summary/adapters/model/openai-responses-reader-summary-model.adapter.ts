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
} from "../../ports";
import { buildReaderSummary } from "../../domain";
import {
  asRecord,
  assertOpenAiReaderSummaryDraftShape,
  buildOpenAiReaderSummaryLineage,
  classifyOpenAiReaderSummaryHttpFailure,
  extractOpenAiOutputText,
  normalizeOpenAiReaderSummaryDraft,
  OpenAiReaderSummaryOutputParseError,
  openAiReaderSummaryJsonSchema,
  parseOpenAiReaderSummaryJsonObject,
  readOpenAiResponseBody,
  resolveOpenAiReaderSummaryUsage,
} from "./openai-responses-reader-summary-model-support";
import {
  openAiApiKeySourceDescription,
  resolveOpenAiApiKey,
} from "./openai-api-key-source";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type OpenAiResponsesReaderSummaryModelAdapterOptions = {
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

const provider = "openai-responses";
const defaultModel = "gpt-5.4-mini";
const defaultPromptVersion = "reader_summary.prompt.openai.responses.v9";
const defaultEvalDatasetVersion = "reader_summary.eval.mvp.v1";
const defaultEndpointUrl = "https://api.openai.com/v1/responses";
const defaultTimeoutMs = 180_000;
const defaultMaxOutputTokens = 16_000;
const defaultInputTokenDivisor = 4;

export class OpenAiResponsesReaderSummaryModelAdapter implements ReaderSummaryModelPort {
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

  constructor(options: OpenAiResponsesReaderSummaryModelAdapterOptions = {}) {
    this.apiKey = options.apiKey?.trim() ?? "";
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
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute {
    const route = this.buildRoute();
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
      input.evidence.selectedEvidence.length === 0
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

  async generate(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    if (input.evidence.selectedEvidence.length === 0) {
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

    const responseJson = await this.createResponse({
      model: selectedRoute.model,
      store: false,
      max_output_tokens: this.maxOutputTokens,
      instructions: buildOpenAiReaderSummaryInstructions(input),
      input: buildOpenAiReaderSummaryPromptPayload(input),
      text: {
        format: {
          type: "json_schema",
          name: "social_monitor_reader_summary_artifact",
          strict: true,
          schema: openAiReaderSummaryJsonSchema,
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
    if (error instanceof ReaderSummaryModelProviderError) {
      return error.failure;
    }

    if (error instanceof OpenAiReaderSummaryOutputParseError) {
      return {
        kind: "invalid_schema",
        retryable: true,
        message: error.message,
      };
    }

    if (error instanceof Error && error.name === "AbortError") {
      return {
        kind: "provider_unavailable",
        retryable: true,
        message: "OpenAI reader summary request timed out",
      };
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unknown reader summary model error";
    const lower = message.toLowerCase();

    if (lower.includes("budget")) {
      return { kind: "budget_exceeded", retryable: false, message };
    }
    if (lower.includes("citation")) {
      return { kind: "citation_validation_failed", retryable: false, message };
    }
    if (lower.includes("schema") || lower.includes("json")) {
      return { kind: "invalid_schema", retryable: false, message };
    }

    return { kind: "unknown", retryable: false, message };
  }

  private buildRoute(): ReaderSummaryModelRoute {
    return {
      provider,
      model: this.model,
      promptVersion: this.promptVersion,
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  private buildNoSignalAttempt(
    input: ReaderSummaryModelInput,
    selectedRoute: ReaderSummaryModelRoute,
  ): ProviderReaderSummaryAttempt {
    const noSignalDraft = {
      headline: "No reliable workspace signal yet",
      executiveSummary:
        "No eligible evidence items were available for this summary window.",
      topStories: [],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [
        {
          description:
            "The summary window did not contain enough primary evidence to produce claims.",
          reason: "insufficient_evidence" as const,
        },
      ],
      citationMap: [],
      qualityFlags: ["no_signal", "limited_sources"] as const,
      confidence: {
        level: "none" as const,
        score: 0,
        rationale: "No primary evidence was selected for the summary window.",
      },
      lineage: buildOpenAiReaderSummaryLineage(
        input,
        selectedRoute,
        this.evalDatasetVersion,
      ),
      usage: this.estimate(input, selectedRoute),
      noSignalReason:
        "No eligible evidence items selected for this summary scope.",
    };

    return {
      route: selectedRoute,
      draft: {
        ...noSignalDraft,
        content: buildReaderSummary({
          ...noSignalDraft,
          storyClusters: input.evidence.clusters,
          sourceWindow: input.evidence.sourceWindow,
          selectedEvidence: input.evidence.selectedEvidence,
        }),
      },
    };
  }

  private async createResponse(
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.endpointUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const body = await readOpenAiResponseBody(response);

      if (!response.ok) {
        throw new ReaderSummaryModelProviderError(
          classifyOpenAiReaderSummaryHttpFailure(response.status, body),
        );
      }

      const record = asRecord(body);
      if (record === null) {
        throw new ReaderSummaryModelProviderError({
          kind: "invalid_schema",
          retryable: false,
          message: "OpenAI response body must be a JSON object",
        });
      }

      return record;
    } catch (error) {
      if (
        error instanceof ReaderSummaryModelProviderError ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error;
      }

      throw new ReaderSummaryModelProviderError({
        kind: "provider_unavailable",
        retryable: true,
        message:
          error instanceof Error
            ? error.message
            : "OpenAI reader summary request failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const resolveOpenAiResponsesReaderSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireApiKey: boolean },
): OpenAiResponsesReaderSummaryModelAdapterOptions => {
  const apiKey = resolveOpenAiApiKey(env);

  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error(
      `READER_SUMMARY_MODEL_PROVIDER=openai-responses requires ${openAiApiKeySourceDescription}`,
    );
  }

  return {
    apiKey,
    endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
    model:
      env.OPENAI_READER_SUMMARY_MODEL ??
      env.OPENAI_READER_SUMMARY_MODEL ??
      env.OPENAI_SUMMARY_MODEL,
    promptVersion:
      env.OPENAI_READER_SUMMARY_PROMPT_VERSION ??
      env.OPENAI_READER_SUMMARY_PROMPT_VERSION,
    evalDatasetVersion:
      env.READER_SUMMARY_EVAL_DATASET_VERSION ??
      env.READER_SUMMARY_EVAL_DATASET_VERSION,
    timeoutMs: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_TIMEOUT_MS ??
        env.OPENAI_READER_SUMMARY_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS ??
        env.OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS,
    ),
    estimatedInputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS,
    ),
    estimatedOutputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS,
    ),
  };
};

class ReaderSummaryModelProviderError extends Error {
  constructor(readonly failure: ReaderSummaryModelFailure) {
    super(failure.message);
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

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const parseNonNegativeNumber = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
