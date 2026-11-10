import { 
  OpenAiReaderSummaryWeeklyModelError,
  extractSingleOutputText,
  isTimeoutError,
  modelError,
  readCompletedResponse,
  timeoutFailure,
  type OpenAiReaderSummaryWeeklyModelFailure,
} from "./openai-responses-reader-summary-weekly-response-contract";

export {
  OpenAiReaderSummaryWeeklyModelError,
  type OpenAiReaderSummaryWeeklyModelFailure,
  type OpenAiReaderSummaryWeeklyModelFailureKind,
} from "./openai-responses-reader-summary-weekly-response-contract";

import {
  assertReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
  type ReaderSummaryWeeklyModelPort,
} from "../../ports/reader-summary-weekly-model.port";
import {
  openAiApiKeySourceDescription,
  resolveOpenAiApiKey,
} from "./openai-api-key-source";
import {
  buildOpenAiReaderSummaryWeeklyInstructions,
  buildOpenAiReaderSummaryWeeklyPromptPayload,
} from "./openai-responses-reader-summary-weekly-prompt";
import {
  OpenAiReaderSummaryWeeklyOutputParseError,
  parseOpenAiReaderSummaryWeeklyResponse,
} from "./openai-responses-reader-summary-weekly-response-parser";
import { buildOpenAiReaderSummaryWeeklyResponseFormat } from "./openai-responses-reader-summary-weekly-schema";

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions = Readonly<{
  apiKey?: string;
  endpointUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchFn?: FetchLike;
}>;

const defaultEndpointUrl = "https://api.openai.com/v1/responses";
const defaultModel = "gpt-5.4-mini";
const defaultTimeoutMs = 180_000;
const defaultMaxOutputTokens = 16_000;

export class OpenAiResponsesReaderSummaryWeeklyModelAdapter
implements ReaderSummaryWeeklyModelPort {
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly fetchFn: FetchLike;

  constructor(
    options: OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions = {},
  ) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.endpointUrl = nonEmptyOrFallback(
      options.endpointUrl,
      defaultEndpointUrl,
    );
    this.model = nonEmptyOrFallback(options.model, defaultModel);
    this.timeoutMs = positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    );
    this.maxOutputTokens = positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    );
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generate(
    input: ReaderSummaryWeeklyModelInput,
  ): Promise<ReaderSummaryWeeklyModelOutput> {
    assertValidWeeklyInput(input);
    if (this.apiKey.length === 0) {
      throw modelError(
        "configuration",
        false,
        `OpenAI reader summary weekly model requires ${openAiApiKeySourceDescription}`,
      );
    }

    const response = await this.createResponse({
      model: this.model,
      store: false,
      max_output_tokens: this.maxOutputTokens,
      instructions: buildOpenAiReaderSummaryWeeklyInstructions(),
      input: buildOpenAiReaderSummaryWeeklyPromptPayload(input),
      text: {
        format: buildOpenAiReaderSummaryWeeklyResponseFormat(input),
      },
    });
    const responseJson = await readCompletedResponse(response);
    const outputText = extractSingleOutputText(responseJson);

    try {
      return parseOpenAiReaderSummaryWeeklyResponse(input, outputText);
    } catch (error) {
      throw modelError(
        "output_validation",
        false,
        error instanceof Error
          ? error.message
          : "OpenAI reader summary weekly output validation failed",
      );
    }
  }

  classifyError(error: unknown): OpenAiReaderSummaryWeeklyModelFailure {
    if (error instanceof OpenAiReaderSummaryWeeklyModelError) {
      return error.failure;
    }
    if (error instanceof OpenAiReaderSummaryWeeklyOutputParseError) {
      return {
        kind: "output_validation",
        retryable: false,
        message: error.message,
      };
    }
    if (isTimeoutError(error)) {
      return timeoutFailure();
    }
    return {
      kind: "unknown",
      retryable: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown OpenAI reader summary weekly model failure",
    };
  }

  private async createResponse(
    request: Readonly<Record<string, unknown>>,
  ): Promise<Response> {
    try {
      return await this.fetchFn(this.endpointUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof OpenAiReaderSummaryWeeklyModelError) {
        throw error;
      }
      if (isTimeoutError(error)) {
        throw new OpenAiReaderSummaryWeeklyModelError(timeoutFailure());
      }
      throw modelError(
        "transport",
        true,
        "OpenAI reader summary weekly transport failed",
      );
    }
  }
}

export const resolveOpenAiResponsesReaderSummaryWeeklyModelOptions = (
  env: NodeJS.ProcessEnv,
  params: Readonly<{ requireApiKey: boolean }>,
): OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions => {
  const apiKey = resolveOpenAiApiKey(env);
  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error(
      `OpenAI reader summary weekly model requires ${openAiApiKeySourceDescription}`,
    );
  }
  return {
    apiKey,
    endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
    model:
      env.OPENAI_READER_SUMMARY_WEEKLY_MODEL ??
      env.OPENAI_READER_SUMMARY_MODEL ??
      env.OPENAI_SUMMARY_MODEL,
    timeoutMs: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_WEEKLY_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.OPENAI_READER_SUMMARY_WEEKLY_MAX_OUTPUT_TOKENS,
    ),
  };
};

const assertValidWeeklyInput = (
  input: ReaderSummaryWeeklyModelInput,
): void => {
  try {
    assertReaderSummaryWeeklyModelInput(input);
  } catch (error) {
    throw modelError(
      "invalid_input",
      false,
      error instanceof Error
        ? error.message
        : "Reader summary weekly model input is invalid",
    );
  }
};

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

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
