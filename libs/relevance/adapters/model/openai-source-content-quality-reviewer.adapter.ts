import type { JsonObject } from "@social-monitor/shared-kernel";

import type {
  SourceContentQualityReviewerPort,
  SourceContentQualityReviewRequest,
  SourceContentQualityReviewResult,
} from "../../ports";

import { promotionReviewInstructions, promotionWireCandidate } from "./promotion-review-wire";
import { buildInstructions, parseReviews, responseSchema, promotionResponseSchema,
  asRecord, asOptionalRecord } from "./source-content-quality-review-wire";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type OpenAiSourceContentQualityReviewerOptions = {
  readonly apiKey: string;
  readonly endpointUrl?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly fetchFn?: FetchLike;
};

const defaultEndpointUrl = "https://api.openai.com/v1/responses";
const defaultModel = "gpt-5.4-mini";
const defaultTimeoutMs = 45_000;
const defaultMaxOutputTokens = 1_500;

export class OpenAiSourceContentQualityReviewerAdapter implements SourceContentQualityReviewerPort {
  readonly promotionTiming: { readonly batchTimeoutMs: number; readonly totalTimeoutMs: number };
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly promotionMaxOutputTokens: number;
  private readonly fetchFn: FetchLike;

  constructor(options: OpenAiSourceContentQualityReviewerOptions) {
    this.apiKey = options.apiKey.trim();
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
    this.promotionMaxOutputTokens = positiveIntegerOrFallback(options.maxOutputTokens, 4_000);
    this.fetchFn = options.fetchFn ?? fetch;
    this.promotionTiming = Object.freeze({ batchTimeoutMs: Math.min(this.timeoutMs, 600_000),
      totalTimeoutMs: Math.min(Math.max(60_000, this.timeoutMs), 600_000) });
  }

  async reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
    options?: { readonly signal: AbortSignal; readonly timeoutMs?: number },
  ): Promise<readonly SourceContentQualityReviewResult[]> {
    if (requests.length === 0) {
      return [];
    }

    if (this.apiKey.length === 0) {
      throw new Error("OpenAI source content quality reviewer requires apiKey");
    }

    const promotion = requests.some((request) => request.promotion !== undefined);
    if (promotion && requests.some((request) => request.promotion === undefined)) {
      throw new Error("Cannot mix promotion and ordinary quality review requests");
    }
    const timeoutMs = Math.min(this.timeoutMs, options?.timeoutMs ?? this.timeoutMs);
    if (timeoutMs <= 0 || options?.signal.aborted) throw new Error("Assessment deadline exhausted");
    const signal = options === undefined ? AbortSignal.timeout(timeoutMs)
      : AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]);
    const response = await this.fetchFn(this.endpointUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      signal,
      body: JSON.stringify({
        model: this.model,
        store: false,
        max_output_tokens: promotion ? this.promotionMaxOutputTokens : this.maxOutputTokens,
        instructions: promotion ? promotionReviewInstructions : buildInstructions(),
        input: JSON.stringify({
          candidates: requests.map((request) => promotion ? promotionWireCandidate(request) : ({
            candidateId: request.candidateId,
            providerKey: request.providerKey,
            authorHandle: request.authorHandle,
            title: request.title,
            bodyPreview: request.bodyPreview,
            canonicalUrl: request.canonicalUrl,
            deterministic: request.deterministic,
          })),
        }),
        text: {
          format: {
            type: "json_schema",
            name: "social_monitor_source_content_quality_review",
            strict: true,
            schema: promotion ? promotionResponseSchema : responseSchema,
          },
        },
      }),
    });

    const body = await readJsonObject(response);

    if (!response.ok) {
      throw new Error(
        `OpenAI source content quality reviewer failed with HTTP ${response.status}`,
      );
    }

    if (promotion && signal.aborted) throw new Error("Assessment deadline exhausted");
    return parseReviews(promotion ? completedPromotionOutput(body) : extractOutputText(body),
      promotion ? requests : undefined);
  }
}

const readJsonObject = async (response: Response): Promise<JsonObject> => {
  const value = (await response.json()) as unknown;

  return asRecord(value, "OpenAI quality review response");
};

const extractOutputText = (response: JsonObject): string | undefined => {
  const output = response.output;

  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    const content = asOptionalRecord(item)?.content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const record = asOptionalRecord(contentItem);
      const text = record?.text;

      if (
        (record?.type === "output_text" || typeof text === "string") &&
        typeof text === "string" &&
        text.trim().length > 0
      ) {
        return text;
      }
    }
  }

  return undefined;
};

// Ordinary ranking retains its historical wire compatibility. Admission evidence
// requires a terminal successful response, including the selected assistant turn.
const completedPromotionOutput = (response: JsonObject): string => {
  if (response.status !== "completed" || response.error != null ||
      response.incomplete_details != null || !Array.isArray(response.output)) {
    throw new Error("Assessment response is not successfully completed");
  }
  const messages = response.output.map(asOptionalRecord);
  if (messages.some((item) => item === undefined ||
      (item.type !== "reasoning" && item.type !== "message") ||
      item.error != null || item.refusal != null ||
      (item.status != null && item.status !== "completed"))) {
    throw new Error("Invalid assessment output state");
  }
  const assistant = messages.filter((item) => item?.type === "message");
  const message = assistant[0];
  if (assistant.length !== 1 || message?.role !== "assistant" ||
      message.status !== "completed" || !Array.isArray(message.content) ||
      message.content.length !== 1) throw new Error("Invalid assessment assistant completion");
  const content = asOptionalRecord(message.content[0]);
  if (content?.type !== "output_text" || content.refusal != null || content.error != null ||
      typeof content.text !== "string" || !content.text.trim()) {
    throw new Error("Invalid assessment completed text");
  }
  return content.text;
};

const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? fallback
    : normalized;
};

const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  value === undefined || !Number.isInteger(value) || value <= 0
    ? fallback
    : value;
