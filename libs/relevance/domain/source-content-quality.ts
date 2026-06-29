import type { JsonObject } from "@social-monitor/shared-kernel";

import {
  isTrustedXAuthor,
  isXProvider,
  normalizeSourceContentQualityInput,
  type NormalizedSourceContentQualityInput,
} from "./source-content-quality-normalizer";

export type SourceContentQualityFlag =
  | "crypto_promo"
  | "engagement_bait"
  | "generic_question"
  | "low_information_density"
  | "media_only_without_context"
  | "needs_link_context"
  | "official_account"
  | "personal_medical_anecdote"
  | "promo_offer"
  | "prediction_market_rumor"
  | "rumor_only"
  | "trusted_author"
  | "tco_only"
  | "url_only"
  | "weak_topic_match"
  | "llm_downranked"
  | "llm_needs_context"
  | "llm_promoted"
  | "llm_rejected";

export type SourceContentQualityDecision =
  "promote" | "keep" | "downrank" | "reject" | "needs_context";

export type SourceContentQualityInput = {
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
  readonly authorHandle?: string;
  readonly providerMetadata?: JsonObject;
};

export type SourceContentQualityReview = {
  readonly decision: SourceContentQualityDecision;
  readonly confidence: number;
  readonly qualityScore?: number;
  readonly topicRelevanceScore?: number;
  readonly engagementIntegrityScore?: number;
  readonly flags?: readonly SourceContentQualityFlag[];
  readonly reason: string;
};

export type SourceContentQualityVerdict = {
  readonly qualityScore: number;
  readonly topicRelevanceScore: number;
  readonly engagementIntegrityScore: number;
  readonly eligibleForSummary: boolean;
  readonly eligibleForTopRead: boolean;
  readonly needsLlmReview: boolean;
  readonly decision: SourceContentQualityDecision;
  readonly flags: readonly SourceContentQualityFlag[];
  readonly reason: string;
};

export class SourceContentQualityPolicy {
  evaluate(input: SourceContentQualityInput): SourceContentQualityVerdict {
    const normalized = normalizeSourceContentQualityInput(input);

    if (!isXProvider(input.providerKey)) {
      return evaluateNonXSource(normalized);
    }

    const flags = new Set<SourceContentQualityFlag>();
    const officialAccount = isTrustedXAuthor(normalized.authorHandle);

    if (officialAccount) {
      flags.add("official_account");
      flags.add("trusted_author");
    }

    if (normalized.tcoOnly) {
      flags.add("tco_only");
    }

    if (normalized.urlOnly) {
      flags.add("url_only");
    }

    if (normalized.lowInformationDensity) {
      flags.add("low_information_density");
    }

    if (normalized.mediaOnlyWithoutContext) {
      flags.add("media_only_without_context");
    }

    if (normalized.cryptoPromo) {
      flags.add("crypto_promo");
    }

    if (normalized.engagementBait) {
      flags.add("engagement_bait");
    }

    if (normalized.promoOffer) {
      flags.add("promo_offer");
    }

    if (normalized.genericQuestion) {
      flags.add("generic_question");
    }

    if (normalized.predictionMarketRumor) {
      flags.add("prediction_market_rumor");
    }

    if (normalized.rumorOnly) {
      flags.add("rumor_only");
    }

    if (normalized.personalMedicalAnecdote) {
      flags.add("personal_medical_anecdote");
    }

    if (normalized.weakTopicMatch) {
      flags.add("weak_topic_match");
    }

    if (normalized.needsLinkContext) {
      flags.add("needs_link_context");
    }

    const qualityScore = clampScore(
      0.88 +
        (officialAccount ? 0.12 : 0) -
        (normalized.urlOnly ? 0.52 : 0) -
        (normalized.lowInformationDensity ? 0.22 : 0) -
        (normalized.mediaOnlyWithoutContext ? 0.2 : 0) -
        (normalized.cryptoPromo ? 0.5 : 0) -
        (normalized.engagementBait ? 0.2 : 0) -
        (normalized.promoOffer ? 0.45 : 0) -
        (normalized.genericQuestion ? 0.12 : 0) -
        (normalized.predictionMarketRumor ? 0.18 : 0) -
        (normalized.rumorOnly ? 0.24 : 0) -
        (normalized.personalMedicalAnecdote ? 0.34 : 0),
    );
    const topicRelevanceScore = clampScore(
      normalized.topicTerms.length === 0
        ? 0.66
        : normalized.weakTopicMatch
          ? 0.24
          : 0.88,
    );
    const engagementIntegrityScore = clampScore(
      0.94 +
        (officialAccount ? 0.06 : 0) -
        (normalized.urlOnly ? 0.32 : 0) -
        (normalized.cryptoPromo ? 0.5 : 0) -
        (normalized.engagementBait ? 0.26 : 0) -
        (normalized.promoOffer ? 0.5 : 0) -
        (normalized.predictionMarketRumor ? 0.34 : 0) -
        (normalized.rumorOnly ? 0.32 : 0) -
        (normalized.personalMedicalAnecdote ? 0.42 : 0) -
        (normalized.weakTopicMatch ? 0.24 : 0),
    );
    const decision = decide({
      officialAccount,
      normalized,
      qualityScore,
      topicRelevanceScore,
      engagementIntegrityScore,
    });

    return finalizeVerdict({
      qualityScore,
      topicRelevanceScore,
      engagementIntegrityScore,
      decision,
      flags: [...flags],
      needsLlmReview: needsLlmReview({
        decision,
        normalized,
        qualityScore,
        topicRelevanceScore,
        engagementIntegrityScore,
      }),
      reason: buildReason(decision, [...flags]),
    });
  }

  mergeWithReview(
    deterministic: SourceContentQualityVerdict,
    review: SourceContentQualityReview | undefined,
  ): SourceContentQualityVerdict {
    if (review === undefined || review.confidence < 0.55) {
      return deterministic;
    }

    const hardBlocked = hasHardBlocker(deterministic.flags);
    const reviewDecision = hardBlocked
      ? deterministic.decision
      : review.decision;
    const blendWeight = review.confidence >= 0.8 ? 0.45 : 0.25;
    const flags = new Set<SourceContentQualityFlag>([
      ...deterministic.flags,
      ...(review.flags ?? []),
    ]);

    if (review.decision === "promote" && !hardBlocked) {
      flags.add("llm_promoted");
    }
    if (review.decision === "downrank") {
      flags.add("llm_downranked");
    }
    if (review.decision === "reject") {
      flags.add("llm_rejected");
    }
    if (review.decision === "needs_context") {
      flags.add("llm_needs_context");
    }

    const qualityScore = blendScore(
      deterministic.qualityScore,
      review.qualityScore,
      blendWeight,
    );
    const topicRelevanceScore = blendScore(
      deterministic.topicRelevanceScore,
      review.topicRelevanceScore,
      blendWeight,
    );
    const engagementIntegrityScore = blendScore(
      deterministic.engagementIntegrityScore,
      review.engagementIntegrityScore,
      blendWeight,
    );

    return finalizeVerdict({
      qualityScore,
      topicRelevanceScore,
      engagementIntegrityScore,
      decision: reviewDecision,
      flags: [...flags],
      needsLlmReview: false,
      reason:
        review.reason.trim().length === 0
          ? deterministic.reason
          : review.reason.trim(),
    });
  }
}

const evaluateNonXSource = (
  normalized: NormalizedSourceContentQualityInput,
): SourceContentQualityVerdict => {
  const flags = new Set<SourceContentQualityFlag>();

  if (normalized.weakTopicMatch) {
    flags.add("weak_topic_match");
  }
  if (normalized.predictionMarketRumor) {
    flags.add("prediction_market_rumor");
  }
  if (normalized.promoOffer) {
    flags.add("promo_offer");
  }
  if (normalized.rumorOnly) {
    flags.add("rumor_only");
  }
  if (normalized.personalMedicalAnecdote) {
    flags.add("personal_medical_anecdote");
  }

  const qualityScore = clampScore(
    0.95 -
      (normalized.lowInformationDensity ? 0.12 : 0) -
      (normalized.weakTopicMatch ? 0.16 : 0) -
      (normalized.promoOffer ? 0.42 : 0) -
      (normalized.predictionMarketRumor ? 0.22 : 0) -
      (normalized.rumorOnly ? 0.28 : 0) -
      (normalized.personalMedicalAnecdote ? 0.42 : 0),
  );
  const topicRelevanceScore = clampScore(
    normalized.topicTerms.length === 0
      ? 0.86
      : normalized.weakTopicMatch
        ? 0.38
        : 0.9,
  );
  const engagementIntegrityScore = clampScore(
    0.92 -
      (normalized.predictionMarketRumor ? 0.28 : 0) -
      (normalized.promoOffer ? 0.5 : 0) -
      (normalized.rumorOnly ? 0.34 : 0) -
      (normalized.personalMedicalAnecdote ? 0.46 : 0),
  );
  const decision = normalized.promoOffer
    ? "reject"
    : normalized.weakTopicMatch ||
        normalized.predictionMarketRumor ||
        normalized.rumorOnly ||
        normalized.personalMedicalAnecdote
      ? "downrank"
      : "promote";

  return finalizeVerdict({
    qualityScore,
    topicRelevanceScore,
    engagementIntegrityScore,
    decision,
    flags: [...flags],
    needsLlmReview:
      normalized.weakTopicMatch ||
      normalized.predictionMarketRumor ||
      normalized.rumorOnly ||
      normalized.personalMedicalAnecdote,
    reason:
      flags.size === 0
        ? "Provider-native quality signal with topic match"
        : `${decision} because ${[...flags].slice(0, 4).join(", ")}`,
  });
};

const decide = (params: {
  readonly officialAccount: boolean;
  readonly normalized: NormalizedSourceContentQualityInput;
  readonly qualityScore: number;
  readonly topicRelevanceScore: number;
  readonly engagementIntegrityScore: number;
}): SourceContentQualityDecision => {
  if (params.normalized.cryptoPromo || params.normalized.promoOffer) {
    return "reject";
  }

  if (params.normalized.needsLinkContext) {
    return "needs_context";
  }

  if (params.normalized.urlOnly && !params.officialAccount) {
    return "reject";
  }

  if (
    params.qualityScore < 0.32 ||
    params.topicRelevanceScore < 0.2 ||
    params.engagementIntegrityScore < 0.3
  ) {
    return "reject";
  }

  if (
    params.qualityScore < 0.68 ||
    params.topicRelevanceScore < 0.56 ||
    params.engagementIntegrityScore < 0.58 ||
    params.normalized.engagementBait ||
    params.normalized.promoOffer ||
    params.normalized.genericQuestion ||
    params.normalized.predictionMarketRumor ||
    params.normalized.rumorOnly ||
    params.normalized.personalMedicalAnecdote
  ) {
    return "downrank";
  }

  return params.qualityScore >= 0.82 && params.topicRelevanceScore >= 0.75
    ? "promote"
    : "keep";
};

const finalizeVerdict = (params: {
  readonly qualityScore: number;
  readonly topicRelevanceScore: number;
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
    params.topicRelevanceScore >= 0.34 &&
    params.engagementIntegrityScore >= 0.36;
  const eligibleForTopRead =
    eligibleForSummary &&
    params.qualityScore >= 0.65 &&
    params.topicRelevanceScore >= 0.5 &&
    params.engagementIntegrityScore >= 0.56 &&
    !flags.includes("engagement_bait") &&
    !flags.includes("generic_question") &&
    !flags.includes("prediction_market_rumor") &&
    !flags.includes("rumor_only") &&
    !flags.includes("personal_medical_anecdote");

  return {
    qualityScore: roundScore(params.qualityScore),
    topicRelevanceScore: roundScore(params.topicRelevanceScore),
    engagementIntegrityScore: roundScore(params.engagementIntegrityScore),
    eligibleForSummary,
    eligibleForTopRead,
    needsLlmReview: params.needsLlmReview,
    decision: params.decision,
    flags,
    reason: params.reason,
  };
};

const needsLlmReview = (params: {
  readonly decision: SourceContentQualityDecision;
  readonly normalized: NormalizedSourceContentQualityInput;
  readonly qualityScore: number;
  readonly topicRelevanceScore: number;
  readonly engagementIntegrityScore: number;
}): boolean => {
  if (params.decision === "reject") {
    return false;
  }

  return (
    params.decision === "needs_context" ||
    params.normalized.weakTopicMatch ||
    params.normalized.predictionMarketRumor ||
    params.normalized.rumorOnly ||
    params.normalized.personalMedicalAnecdote ||
    (params.qualityScore >= 0.35 && params.qualityScore < 0.76) ||
    (params.topicRelevanceScore >= 0.25 && params.topicRelevanceScore < 0.62) ||
    params.engagementIntegrityScore < 0.68
  );
};

const hasHardBlocker = (flags: readonly SourceContentQualityFlag[]): boolean =>
  flags.includes("crypto_promo") ||
  flags.includes("promo_offer") ||
  flags.includes("url_only") ||
  flags.includes("tco_only") ||
  flags.includes("needs_link_context") ||
  flags.includes("media_only_without_context") ||
  flags.includes("personal_medical_anecdote");

const buildReason = (
  decision: SourceContentQualityDecision,
  flags: readonly SourceContentQualityFlag[],
): string => {
  if (flags.length === 0) {
    return "High-context X post with direct topic match";
  }

  return `${decision} because ${flags.slice(0, 4).join(", ")}`;
};

const blendScore = (
  deterministic: number,
  reviewed: number | undefined,
  reviewWeight: number,
): number =>
  reviewed === undefined || !Number.isFinite(reviewed)
    ? deterministic
    : clampScore(deterministic * (1 - reviewWeight) + reviewed * reviewWeight);

const clampScore = (value: number): number => Math.min(1, Math.max(0, value));

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
