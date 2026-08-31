import { createHash } from "node:crypto";

import { currentReaderSummaryPromptRelease } from
  "@social-monitor/summary/adapters/model/openai-responses-reader-summary-prompt";

import type { HistoricalPromotionGenerationAuthority } from
  "./reader-summary-promotion-v2-historical-input";

export type HistoricalPromotionPolicySnapshot =
  HistoricalPromotionGenerationAuthority["policy"];

const customInstructions =
  "Build a practical daily reader summary for AI/product/social monitoring. Prefer fresh, cited, high-signal items and clearly separate facts from risks.";

export const historicalPromotionGenerationAuthority = (input: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly policy?: HistoricalPromotionPolicySnapshot;
}): HistoricalPromotionGenerationAuthority => ({
  policy: input.policy ?? {
    id: deterministicUuid([
      "reader-summary-policy",
      input.tenantId,
      input.workspaceId,
      "workspace",
    ].join(":")),
    language: "auto",
    format: "executive_brief",
    tone: "analytical",
    maxStories: 15,
    includeRisks: true,
    includeInterestHighlights: true,
    includeRepeatedSignals: true,
    dedupeStrategy: "canonical_url_then_title",
    customInstructions,
    rulesVersion: "reader_summary.rules.policy.v1",
  },
  execution: {
    release: "reader-summary-production-day.promotion-v2.v1",
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    runtimeEngine: "subscription-runtime-cli",
    promptVersion: currentReaderSummaryPromptRelease.id,
    topicLabelerPromptVersion: optional(
      input.env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_PROMPT_VERSION,
      "reader_summary.topic_map.agent_runtime.v21",
    ),
    topicRelationPromptVersion: optional(
      input.env
        .AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_PROMPT_VERSION,
      "reader_summary.topic_relation.agent_runtime.v3",
    ),
    evalDatasetVersion: optional(
      input.env.READER_SUMMARY_EVAL_DATASET_VERSION,
      "reader_summary.eval.mvp.v1",
    ),
    rankingPolicyVersion: "story_ranking_v10",
    promotionPolicyVersion: "reader_post_promotion.v2",
    maxEvidenceItems: 120,
    maxGeneratedStories: 15,
    topicLabelerMaxCandidates: 18,
    maxOutputTokens: positiveInteger(
      input.env.AGENT_RUNTIME_READER_SUMMARY_MAX_OUTPUT_TOKENS,
      16_000,
    ),
  },
});

const optional = (value: string | undefined, fallback: string): string => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? fallback
    : normalized;
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Historical promotion output token limit is invalid");
  }
  return parsed;
};

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(createHash("sha256").update(value).digest())
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20),
  ].join("-");
};
