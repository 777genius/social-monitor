import type { JsonObject } from "@social-monitor/shared-kernel";

import {
  isTrustedXAuthor,
  isXProvider,
  normalizeSourceContentQualityInput,
  type NormalizedSourceContentQualityInput,
} from "./source-content-quality-normalizer";
import {
  blendScore,
  buildReason,
  clampScore,
  finalizeVerdict,
  hasHardBlocker,
} from "./source-content-quality-verdict";

export type SourceContentQualityFlag =
  | "crypto_promo"
  | "engagement_bait"
  | "generic_question"
  | "low_information_density"
  | "media_only_without_context"
  | "missing_topic_context"
  | "needs_link_context"
  | "official_account"
  | "personal_medical_anecdote"
  | "promo_offer"
  | "prediction_market_rumor"
  | "rumor_only"
  | "speculative_financial_challenge"
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
  readonly interestRelevanceScore?: number;
  readonly engagementIntegrityScore?: number;
  readonly flags?: readonly SourceContentQualityFlag[];
  readonly reason: string;
};

export type SourceContentQualityVerdict = {
  readonly qualityScore: number;
  readonly interestRelevanceScore: number;
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
    if (normalized.speculativeFinancialChallenge) {
      flags.add("speculative_financial_challenge");
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
        (normalized.speculativeFinancialChallenge ? 0.34 : 0) -
        (normalized.personalMedicalAnecdote ? 0.34 : 0),
    );
    const interestRelevanceScore = clampScore(
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
        (normalized.speculativeFinancialChallenge ? 0.36 : 0) -
        (normalized.personalMedicalAnecdote ? 0.42 : 0) -
        (normalized.weakTopicMatch ? 0.24 : 0),
    );
    const decision = decide({
      officialAccount,
      normalized,
      qualityScore,
      interestRelevanceScore,
      engagementIntegrityScore,
    });

    return finalizeVerdict({
      qualityScore,
      interestRelevanceScore,
      engagementIntegrityScore,
      decision,
      flags: [...flags],
      needsLlmReview: needsLlmReview({
        decision,
        normalized,
        qualityScore,
        interestRelevanceScore,
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
    const interestRelevanceScore = blendScore(
      deterministic.interestRelevanceScore,
      review.interestRelevanceScore,
      blendWeight,
    );
    const engagementIntegrityScore = blendScore(
      deterministic.engagementIntegrityScore,
      review.engagementIntegrityScore,
      blendWeight,
    );

    return finalizeVerdict({
      qualityScore,
      interestRelevanceScore,
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
  if (normalized.missingTopicContext) {
    flags.add("missing_topic_context");
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
  if (normalized.speculativeFinancialChallenge) {
    flags.add("speculative_financial_challenge");
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
      (normalized.speculativeFinancialChallenge ? 0.34 : 0) -
      (normalized.personalMedicalAnecdote ? 0.42 : 0),
  );
  const interestRelevanceScore = clampScore(
    normalized.topicTerms.length === 0
      ? normalized.legacyCoreTopicSignal
        ? 0.78
        : 0.49
      : normalized.weakTopicMatch
        ? 0.38
        : 0.9,
  );
  const engagementIntegrityScore = clampScore(
    0.92 -
      (normalized.predictionMarketRumor ? 0.28 : 0) -
      (normalized.promoOffer ? 0.5 : 0) -
      (normalized.rumorOnly ? 0.34 : 0) -
      (normalized.speculativeFinancialChallenge ? 0.36 : 0) -
      (normalized.personalMedicalAnecdote ? 0.46 : 0),
  );
  const decision = normalized.promoOffer
    ? "reject"
    : (normalized.missingTopicContext && !normalized.legacyCoreTopicSignal) ||
        normalized.weakTopicMatch ||
        normalized.predictionMarketRumor ||
        normalized.rumorOnly ||
        normalized.speculativeFinancialChallenge ||
        normalized.personalMedicalAnecdote
      ? "downrank"
      : "promote";

  return finalizeVerdict({
    qualityScore,
    interestRelevanceScore,
    engagementIntegrityScore,
    decision,
    flags: [...flags],
    needsLlmReview:
      normalized.weakTopicMatch ||
      normalized.predictionMarketRumor ||
      normalized.rumorOnly ||
      normalized.speculativeFinancialChallenge ||
      normalized.personalMedicalAnecdote,
    reason:
      flags.size === 0
        ? "Provider-native quality signal with interest match"
        : `${decision} because ${[...flags].slice(0, 4).join(", ")}`,
  });
};

const decide = (params: {
  readonly officialAccount: boolean;
  readonly normalized: NormalizedSourceContentQualityInput;
  readonly qualityScore: number;
  readonly interestRelevanceScore: number;
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
    params.interestRelevanceScore < 0.2 ||
    params.engagementIntegrityScore < 0.3
  ) {
    return "reject";
  }

  if (
    params.qualityScore < 0.68 ||
    params.interestRelevanceScore < 0.56 ||
    params.engagementIntegrityScore < 0.58 ||
    params.normalized.engagementBait ||
    params.normalized.promoOffer ||
    params.normalized.genericQuestion ||
    params.normalized.predictionMarketRumor ||
    params.normalized.rumorOnly ||
    params.normalized.speculativeFinancialChallenge ||
    params.normalized.personalMedicalAnecdote
  ) {
    return "downrank";
  }

  return params.qualityScore >= 0.82 && params.interestRelevanceScore >= 0.75
    ? "promote"
    : "keep";
};

const needsLlmReview = (params: {
  readonly decision: SourceContentQualityDecision;
  readonly normalized: NormalizedSourceContentQualityInput;
  readonly qualityScore: number;
  readonly interestRelevanceScore: number;
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
    params.normalized.speculativeFinancialChallenge ||
    params.normalized.personalMedicalAnecdote ||
    (params.qualityScore >= 0.35 && params.qualityScore < 0.76) ||
    (params.interestRelevanceScore >= 0.25 &&
      params.interestRelevanceScore < 0.62) ||
    params.engagementIntegrityScore < 0.68
  );
};
