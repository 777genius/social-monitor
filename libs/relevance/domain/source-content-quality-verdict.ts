import type {
  SourceContentQualityDecision,
  SourceContentQualityFlag,
  SourceContentQualityVerdict,
} from "./source-content-quality";

export const finalizeVerdict = (params: {
  readonly qualityScore: number;
  readonly interestRelevanceScore: number;
  readonly engagementIntegrityScore: number;
  readonly decision: SourceContentQualityDecision;
  readonly flags: readonly SourceContentQualityFlag[];
  readonly needsLlmReview: boolean;
  readonly reason: string;
}): SourceContentQualityVerdict => {
  const flags = uniqueStable(params.flags);
  const hardBlocked = hasHardBlocker(flags);
  const eligibleForSummary =
    !hardBlocked &&
    params.decision !== "reject" &&
    params.decision !== "needs_context" &&
    params.qualityScore >= 0.38 &&
    params.interestRelevanceScore >= 0.34 &&
    params.engagementIntegrityScore >= 0.36;
  const eligibleForTopRead =
    eligibleForSummary &&
    params.qualityScore >= 0.65 &&
    params.interestRelevanceScore >= 0.5 &&
    params.engagementIntegrityScore >= 0.56 &&
    !flags.includes("engagement_bait") &&
    !flags.includes("generic_question") &&
    !flags.includes("prediction_market_rumor") &&
    !flags.includes("rumor_only") &&
    !flags.includes("speculative_financial_challenge") &&
    !flags.includes("personal_medical_anecdote");

  return {
    qualityScore: roundScore(params.qualityScore),
    interestRelevanceScore: roundScore(params.interestRelevanceScore),
    engagementIntegrityScore: roundScore(params.engagementIntegrityScore),
    eligibleForSummary,
    eligibleForTopRead,
    needsLlmReview: params.needsLlmReview,
    decision: params.decision,
    flags,
    reason: params.reason,
  };
};

export const hasHardBlocker = (
  flags: readonly SourceContentQualityFlag[],
): boolean =>
  flags.includes("crypto_promo") ||
  flags.includes("promo_offer") ||
  flags.includes("url_only") ||
  flags.includes("tco_only") ||
  flags.includes("needs_link_context") ||
  flags.includes("media_only_without_context") ||
  flags.includes("personal_medical_anecdote");

export const buildReason = (
  decision: SourceContentQualityDecision,
  flags: readonly SourceContentQualityFlag[],
): string => {
  if (flags.length === 0) {
    return "High-context X post with direct interest match";
  }

  return `${decision} because ${flags.slice(0, 4).join(", ")}`;
};

export const blendScore = (
  deterministic: number,
  reviewed: number | undefined,
  reviewWeight: number,
): number =>
  reviewed === undefined || !Number.isFinite(reviewed)
    ? deterministic
    : clampScore(deterministic * (1 - reviewWeight) + reviewed * reviewWeight);

export const clampScore = (value: number): number =>
  Math.min(1, Math.max(0, value));

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;

const uniqueStable = <T>(values: readonly T[]): readonly T[] => {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};
