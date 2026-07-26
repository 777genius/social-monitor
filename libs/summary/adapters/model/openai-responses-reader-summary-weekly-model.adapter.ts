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

export type OpenAiReaderSummaryWeeklyModelFailureKind =
  | "invalid_input"
  | "configuration"
  | "transport"
  | "timeout"
  | "http_error"
  | "response_state"
  | "refusal"
  | "invalid_response"
  | "output_validation"
  | "unknown";

export type OpenAiReaderSummaryWeeklyModelFailure = Readonly<{
  kind: OpenAiReaderSummaryWeeklyModelFailureKind;
  retryable: boolean;
  message: string;
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

export class OpenAiReaderSummaryWeeklyModelError extends Error {
  constructor(readonly failure: OpenAiReaderSummaryWeeklyModelFailure) {
    super(failure.message);
    this.name = "OpenAiReaderSummaryWeeklyModelError";
  }
}

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

const readCompletedResponse = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  if (!response.ok) {
    throw modelError(
      "http_error",
      response.status >= 500 && response.status <= 599,
      `OpenAI reader summary weekly request failed with HTTP ${response.status}`,
    );
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new OpenAiReaderSummaryWeeklyModelError(timeoutFailure());
    }
    throw modelError(
      "transport",
      true,
      "OpenAI reader summary weekly response transport failed",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(responseText);
  } catch {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response body must be JSON",
    );
  }
  const record = asRecord(value);
  if (record === null) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response body must be an object",
    );
  }
  assertCompletedResponseState(record);
  return record;
};

const assertCompletedResponseState = (
  response: Record<string, unknown>,
): void => {
  if (hasValue(response, "error")) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response contains an error state",
    );
  }
  if (response.status !== "completed") {
    const received = safeStateLabel(response.status);
    throw modelError(
      "response_state",
      false,
      `OpenAI reader summary weekly response status must be completed; received ${received}`,
    );
  }
  if (hasValue(response, "incomplete_details")) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response is truncated",
    );
  }
  if (hasRefusal(response)) {
    throw modelError(
      "refusal",
      false,
      "OpenAI reader summary weekly response was refused",
    );
  }
  if (hasNestedError(response)) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response contains an error state",
    );
  }
  if (hasIncompleteOutput(response)) {
    throw modelError(
      "response_state",
      false,
      "OpenAI reader summary weekly response output is incomplete",
    );
  }
};

const extractSingleOutputText = (
  response: Record<string, unknown>,
): string => {
  const aggregate = nonEmptyString(response.output_text);
  const fragments: string[] = [];
  if (response.output !== undefined && !Array.isArray(response.output)) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly output must be an array",
    );
  }
  for (const item of Array.isArray(response.output) ? response.output : []) {
    const output = asRecord(item);
    if (output === null || !Array.isArray(output.content)) {
      continue;
    }
    for (const itemContent of output.content) {
      const content = asRecord(itemContent);
      if (content?.type !== "output_text") {
        continue;
      }
      const text = nonEmptyString(content.text);
      if (text === undefined) {
        throw modelError(
          "invalid_response",
          false,
          "OpenAI reader summary weekly output text is empty",
        );
      }
      fragments.push(text);
    }
  }
  if (fragments.length > 1) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response contains stitched output text",
    );
  }
  if (
    aggregate !== undefined &&
    fragments.length === 1 &&
    aggregate !== fragments[0]
  ) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly aggregate output text is inconsistent",
    );
  }
  const outputText = aggregate ?? fragments[0];
  if (outputText === undefined) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response has no output text",
    );
  }
  return outputText;
};

const hasRefusal = (response: Record<string, unknown>): boolean => {
  if (hasValue(response, "refusal")) {
    return true;
  }
  return outputRecords(response).some(
    (record) =>
      record.type === "refusal" ||
      hasValue(record, "refusal") ||
      contentRecords(record).some(
        (content) =>
          content.type === "refusal" || hasValue(content, "refusal"),
      ),
  );
};

const hasNestedError = (response: Record<string, unknown>): boolean =>
  outputRecords(response).some(
    (record) =>
      record.type === "error" ||
      hasValue(record, "error") ||
      contentRecords(record).some(
        (content) =>
          content.type === "error" || hasValue(content, "error"),
      ),
  );

const hasIncompleteOutput = (response: Record<string, unknown>): boolean =>
  outputRecords(response).some(
    (record) =>
      (record.status !== undefined && record.status !== "completed") ||
      hasValue(record, "incomplete_details"),
  );

const outputRecords = (
  response: Record<string, unknown>,
): readonly Record<string, unknown>[] =>
  Array.isArray(response.output)
    ? response.output.flatMap((value) => {
        const record = asRecord(value);
        return record === null ? [] : [record];
      })
    : [];

const contentRecords = (
  output: Record<string, unknown>,
): readonly Record<string, unknown>[] =>
  Array.isArray(output.content)
    ? output.content.flatMap((value) => {
        const record = asRecord(value);
        return record === null ? [] : [record];
      })
    : [];

const modelError = (
  kind: OpenAiReaderSummaryWeeklyModelFailureKind,
  retryable: boolean,
  message: string,
): OpenAiReaderSummaryWeeklyModelError =>
  new OpenAiReaderSummaryWeeklyModelError({ kind, retryable, message });

const timeoutFailure = (): OpenAiReaderSummaryWeeklyModelFailure => ({
  kind: "timeout",
  retryable: true,
  message: "OpenAI reader summary weekly request timed out",
});

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError");

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const hasValue = (
  record: Record<string, unknown>,
  key: string,
): boolean => record[key] !== undefined && record[key] !== null;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const safeStateLabel = (value: unknown): string =>
  typeof value === "string" && /^[a-z_]{1,32}$/u.test(value)
    ? value
    : "missing_or_invalid";

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
