import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";

import type {
  SourceContentQualityDecision,
  SourceContentQualityFlag,
} from "../../domain";
import type {
  SourceContentQualityReviewerPort,
  SourceContentQualityReviewRequest,
  SourceContentQualityReviewResult,
} from "../../ports";

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
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
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
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
  ): Promise<readonly SourceContentQualityReviewResult[]> {
    if (requests.length === 0) {
      return [];
    }

    if (this.apiKey.length === 0) {
      throw new Error("OpenAI source content quality reviewer requires apiKey");
    }

    const response = await this.fetchFn(this.endpointUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        store: false,
        max_output_tokens: this.maxOutputTokens,
        instructions: buildInstructions(),
        input: JSON.stringify({
          candidates: requests.map((request) => ({
            candidateId: request.candidateId,
            providerKey: request.providerKey,
            authorHandle: request.authorHandle,
            title: request.title,
            bodyPreview: request.bodyPreview,
            canonicalUrl: request.canonicalUrl,
            providerMetadata: minimalProviderMetadata(request.providerMetadata),
            deterministic: request.deterministic,
          })),
        }),
        text: {
          format: {
            type: "json_schema",
            name: "social_monitor_source_content_quality_review",
            strict: true,
            schema: responseSchema,
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

    return parseReviews(extractOutputText(body));
  }
}

const buildInstructions = (): string =>
  [
    "You review X/Twitter posts before they reach a workspace summary.",
    "Return only JSON matching the schema.",
    "Use only the provided candidate text and metadata. Do not browse and do not infer facts from links.",
    "Prefer reject or needs_context for URL-only, t.co-only or media-only posts.",
    "Prefer reject for engagement-bait, promo, crypto-adjacent or weak interest match posts.",
    "Prefer downrank for prediction-market, political or rumor-only posts unless the post has concrete AI product facts.",
    "Promote only posts that are self-contained, useful and topical.",
    "The post must be specific enough for a daily AI developer intelligence summary.",
    "Do not override deterministic hard blockers unless the text itself contains enough factual context.",
  ].join("\n");

const minimalProviderMetadata = (
  metadata: JsonObject | undefined,
): JsonObject | undefined => {
  if (metadata === undefined) {
    return undefined;
  }

  const keys = [
    "kind",
    "topic",
    "searchQuery",
    "accountHandle",
    "authorHandle",
    "likes",
    "reposts",
    "retweets",
    "replies",
    "quotes",
    "bookmarks",
    "impressions",
    "public_metrics",
    "publicMetrics",
  ];
  const entries = keys
    .map((key) => [key, metadata[key]] as const)
    .filter(
      (entry): entry is readonly [string, JsonValue] => entry[1] !== undefined,
    );

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

const parseReviews = (
  outputText: string | undefined,
): readonly SourceContentQualityReviewResult[] => {
  if (outputText === undefined) {
    throw new Error("OpenAI source content quality reviewer returned no text");
  }

  const parsed = asRecord(JSON.parse(outputText), "quality review output");
  const reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];

  return reviews.map((review) => {
    const record = asRecord(review, "quality review item");

    return {
      candidateId: nonEmptyString(record.candidateId, "candidateId"),
      decision: readDecision(record.decision),
      confidence: clampNumber(record.confidence, 0, 1),
      qualityScore: optionalScore(record.qualityScore),
      interestRelevanceScore: optionalScore(record.interestRelevanceScore),
      engagementIntegrityScore: optionalScore(record.engagementIntegrityScore),
      flags: readFlags(record.flags),
      reason: nonEmptyString(record.reason, "reason"),
    };
  });
};

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

const readDecision = (
  value: JsonValue | undefined,
): SourceContentQualityDecision => {
  if (
    value === "promote" ||
    value === "keep" ||
    value === "downrank" ||
    value === "reject" ||
    value === "needs_context"
  ) {
    return value;
  }

  return "downrank";
};

const readFlags = (
  value: JsonValue | undefined,
): readonly SourceContentQualityFlag[] =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item : undefined))
        .filter((item): item is SourceContentQualityFlag =>
          allowedFlags.has(item as SourceContentQualityFlag),
        )
    : [];

const optionalScore = (value: JsonValue | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? clampNumber(value, 0, 1)
    : undefined;

const clampNumber = (
  value: JsonValue | undefined,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : min;

const nonEmptyString = (
  value: JsonValue | undefined,
  field: string,
): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(`OpenAI quality review output missing ${field}`);
};

const asRecord = (value: unknown, label: string): JsonObject => {
  const record = asOptionalRecord(value);

  if (record === undefined) {
    throw new Error(`${label} must be a JSON object`);
  }

  return record;
};

const asOptionalRecord = (value: unknown): JsonObject | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

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

const allowedFlags = new Set<SourceContentQualityFlag>([
  "crypto_promo",
  "engagement_bait",
  "generic_question",
  "low_information_density",
  "media_only_without_context",
  "needs_link_context",
  "official_account",
  "personal_medical_anecdote",
  "promo_offer",
  "prediction_market_rumor",
  "rumor_only",
  "speculative_financial_challenge",
  "trusted_author",
  "tco_only",
  "url_only",
  "weak_topic_match",
  "llm_downranked",
  "llm_needs_context",
  "llm_promoted",
  "llm_rejected",
]);

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId",
          "decision",
          "confidence",
          "qualityScore",
          "interestRelevanceScore",
          "engagementIntegrityScore",
          "flags",
          "reason",
        ],
        properties: {
          candidateId: { type: "string", minLength: 1 },
          decision: {
            type: "string",
            enum: ["promote", "keep", "downrank", "reject", "needs_context"],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          qualityScore: { type: "number", minimum: 0, maximum: 1 },
          interestRelevanceScore: { type: "number", minimum: 0, maximum: 1 },
          engagementIntegrityScore: { type: "number", minimum: 0, maximum: 1 },
          flags: {
            type: "array",
            items: { type: "string" },
          },
          reason: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;
