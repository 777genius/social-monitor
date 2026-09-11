import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";
import type { SourceContentQualityDecision, SourceContentQualityFlag } from "../../domain";
import type { SourceContentQualityReviewRequest, SourceContentQualityReviewResult } from "../../ports";
import { bindPromotionAssessment, promotionReviewSchemaProperties } from "./promotion-review-wire";

export const buildInstructions = (): string =>
  [
    "You review X/Twitter posts before they reach a workspace summary.",
    "Return only JSON matching the schema.",
    "Use only the provided candidate text and metadata. Do not browse and do not infer facts from links.",
    "Prefer reject or needs_context for URL-only, t.co-only or media-only posts.",
    "Prefer reject for engagement-bait, promo, crypto-adjacent or weak interest match posts.",
    "Prefer downrank for prediction-market, political or rumor-only posts unless the post has concrete AI product facts.",
    "Promote only posts that are self-contained, useful and topical.",
    "The post must be specific enough for a daily AI developer intelligence summary.",
    "Never override deterministic hard blockers.",
  ].join("\n");

export const parseReviews = (
  outputText: string | undefined,
  requests?: readonly SourceContentQualityReviewRequest[],
): readonly SourceContentQualityReviewResult[] => {
  if (outputText === undefined) {
    throw new Error("OpenAI source content quality reviewer returned no text");
  }

  const parsed = asRecord(JSON.parse(outputText), "quality review output");
  const compatibilityResults = parsed.reviews === undefined && Array.isArray(parsed.results) && requests !== undefined
    ? parsed.results : undefined;
  if (!Array.isArray(parsed.reviews) && compatibilityResults === undefined) {
    throw new Error("Quality review protocol requires a reviews array");
  }
  const reviews = (parsed.reviews ?? compatibilityResults) as JsonValue[];

  return reviews.map((review) => {
    const raw = asRecord(review, "quality review item");

    const candidateId = nonEmptyString(raw.candidateId, "candidateId");
    const request = requests?.find((request) => request.candidateId === candidateId);
    // Two attested native completions used the earlier `results` dialect even
    // though the canonical schema was supplied. Normalize only that complete,
    // request-bound dialect. Its single quality/support score supplies the
    // missing relevance score; integrity retains the deterministic assessment.
    // No source, identity, evidence or blocker is inferred.
    const record = compatibilityResults === undefined || request === undefined ? raw
      : normalizeCompatiblePromotionReview(raw, request);
    if (requests !== undefined && (request === undefined ||
        ![record.confidence, record.qualityScore, record.interestRelevanceScore,
          record.engagementIntegrityScore].every((score) => typeof score === "number" &&
            Number.isFinite(score) && score >= 0 && score <= 1) ||
        !["promote", "keep", "downrank", "reject", "needs_context"].includes(String(record.decision)) ||
        !Array.isArray(record.flags) || record.flags.some((flag) =>
          typeof flag !== "string" || !allowedFlags.has(flag as SourceContentQualityFlag)))) {
      throw new Error("Invalid promotion review result");
    }
    return {
      candidateId,
      ...(request === undefined ? {} : { assessment: bindPromotionAssessment(record, request) }),
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

const normalizeCompatiblePromotionReview = (
  record: JsonObject, request: SourceContentQualityReviewRequest,
): JsonObject => {
  const decision = record.decision === "relevant" ? "promote"
    : record.decision === "not_relevant" ? "reject" : record.decision;
  const reason = Object.hasOwn(record, "reason") ? record.reason : record.justification;
  const resolutions = Object.hasOwn(record, "resolvedSoftFlags") ? record.resolvedSoftFlags
    : Object.hasOwn(record, "flagResolutions") ? record.flagResolutions : record.screeningFlagResolutions;
  return { ...record, decision: decision ?? null,
    interestRelevanceScore: Object.hasOwn(record, "interestRelevanceScore")
      ? record.interestRelevanceScore ?? null : record.qualityScore ?? null,
    engagementIntegrityScore: Object.hasOwn(record, "engagementIntegrityScore")
      ? record.engagementIntegrityScore ?? null : request.deterministic.engagementIntegrityScore,
    flags: Object.hasOwn(record, "flags") ? record.flags ?? null : [], reason: reason ?? null,
    resolvedSoftFlags: resolutions ?? null };
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

export const asRecord = (value: unknown, label: string): JsonObject => {
  const record = asOptionalRecord(value);

  if (record === undefined) {
    throw new Error(`${label} must be a JSON object`);
  }

  return record;
};

export const asOptionalRecord = (value: unknown): JsonObject | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

// Single source of truth for the review-flag vocabulary. The schema enum and
// the parser's semantic check must stay in lockstep: a flag value that the
// schema lets the model emit but the parser rejects turns an otherwise valid,
// attested completion into a hard adapter failure.
export const sourceContentQualityFlagValues = [
  "crypto_promo",
  "engagement_bait",
  "generic_question",
  "low_information_density",
  "media_only_without_context",
  "missing_topic_context",
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
] as const satisfies readonly SourceContentQualityFlag[];

const allowedFlags = new Set<SourceContentQualityFlag>(sourceContentQualityFlagValues);

export const responseSchema = {
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
            items: { type: "string", enum: sourceContentQualityFlagValues },
          },
          reason: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;

export const promotionResponseSchema = {
  ...responseSchema,
  properties: { reviews: { ...responseSchema.properties.reviews, items: {
    ...responseSchema.properties.reviews.items,
    required: [...responseSchema.properties.reviews.items.required,
      ...Object.keys(promotionReviewSchemaProperties)],
    properties: { ...responseSchema.properties.reviews.items.properties,
      ...promotionReviewSchemaProperties },
  } } },
};
