import type {
  SourceContentQualityFlag,
  SourceContentQualityVerdict,
} from "./source-content-quality";
import type { NormalizedSourceContentQualityInput } from "./source-content-quality-normalizer";
import { clampScore, finalizeVerdict } from "./source-content-quality-verdict";

export const evaluateNonXSource = (
  normalized: NormalizedSourceContentQualityInput,
): SourceContentQualityVerdict => {
  const flags = new Set<SourceContentQualityFlag>();

  if (normalized.weakTopicMatch) {
    flags.add("weak_topic_match");
  }
  if (normalized.engagementBait) {
    flags.add("engagement_bait");
  }
  if (normalized.genericQuestion) {
    flags.add("generic_question");
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
        normalized.engagementBait ||
        normalized.genericQuestion ||
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
