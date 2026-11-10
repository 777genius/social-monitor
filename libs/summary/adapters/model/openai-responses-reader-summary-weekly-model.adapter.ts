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
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
  type ReaderSummaryWeeklyModelPort,
} from "../../ports/reader-summary-weekly-model.port";
import { openAiApiKeySourceDescription } from "./openai-api-key-source";
import { assertValidWeeklyInput } from "./openai-responses-reader-summary-weekly-input-admission";
import { postOpenAiReaderSummaryWeeklyResponse } from "./openai-responses-reader-summary-weekly-transport";
import { normalizeOpenAiReaderSummaryWeeklyOptions, type OpenAiReaderSummaryWeeklyFetchLike, type OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions } from "./openai-responses-reader-summary-weekly-options";
export { resolveOpenAiResponsesReaderSummaryWeeklyModelOptions } from "./openai-responses-reader-summary-weekly-options";
export type { OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions } from "./openai-responses-reader-summary-weekly-options";
import {
  buildOpenAiReaderSummaryWeeklyInstructions,
  buildOpenAiReaderSummaryWeeklyPromptPayload,
} from "./openai-responses-reader-summary-weekly-prompt";
import {
  OpenAiReaderSummaryWeeklyOutputParseError,
  parseOpenAiReaderSummaryWeeklyResponse,
} from "./openai-responses-reader-summary-weekly-response-parser";
import { buildOpenAiReaderSummaryWeeklyResponseFormat } from "./openai-responses-reader-summary-weekly-schema";

export class OpenAiResponsesReaderSummaryWeeklyModelAdapter
implements ReaderSummaryWeeklyModelPort {
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly fetchFn: OpenAiReaderSummaryWeeklyFetchLike;

  constructor(
    options: OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions = {},
  ) {
    const resolved = normalizeOpenAiReaderSummaryWeeklyOptions(options);
    this.apiKey = resolved.apiKey;
    this.endpointUrl = resolved.endpointUrl;
    this.model = resolved.model;
    this.timeoutMs = resolved.timeoutMs;
    this.maxOutputTokens = resolved.maxOutputTokens;
    this.fetchFn = resolved.fetchFn;
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

    const response = await postOpenAiReaderSummaryWeeklyResponse({
      apiKey: this.apiKey,
      endpointUrl: this.endpointUrl,
      timeoutMs: this.timeoutMs,
      fetchFn: this.fetchFn,
      request: {
      model: this.model,
      store: false,
      max_output_tokens: this.maxOutputTokens,
      instructions: buildOpenAiReaderSummaryWeeklyInstructions(),
      input: buildOpenAiReaderSummaryWeeklyPromptPayload(input),
      text: {
        format: buildOpenAiReaderSummaryWeeklyResponseFormat(input),
      },
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


}

