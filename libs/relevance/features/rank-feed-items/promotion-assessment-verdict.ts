import type { SourceContentQualityPolicy, SourceContentQualityVerdict } from "../../domain";
import { finalizeVerdict } from "../../domain/source-content-quality-verdict";
import type { PromotionEvidenceReference, SourceContentQualityReviewRequest,
  SourceContentQualityReviewResult } from "../../ports";

export const pendingPromotionAssessment = (
  verdict: SourceContentQualityVerdict, reason: string,
): SourceContentQualityVerdict => ({
  ...verdict, qualityScore: 0, eligibleForSummary: false, eligibleForTopRead: false,
  needsLlmReview: true, decision: "needs_context",
  reason: `promotion_assessment_pending:${reason}`,
});

export const assessedPromotionVerdict = (
  request: SourceContentQualityReviewRequest,
  review: SourceContentQualityReviewResult | undefined,
  policy: SourceContentQualityPolicy,
): SourceContentQualityVerdict => {
  const pending = (reason: string) => pendingPromotionAssessment(request.deterministic, reason);
  if (review === undefined) return pending("missing_result");
  const assessment = review.assessment;
  if (assessment === undefined || assessment === null || assessment.binding !== request.promotion ||
      review.candidateId !== request.candidateId ||
      ![review.confidence, review.qualityScore, review.interestRelevanceScore,
        review.engagementIntegrityScore].every(unitScore) ||
      !["promote", "keep", "downrank", "reject", "needs_context"].includes(review.decision) ||
      !Array.isArray(review.flags) || review.flags.some((flag) => !reviewFlags.has(flag)) ||
      typeof review.reason !== "string" || !review.reason.trim() ||
      !validReferences(request, assessment.evidence) ||
      !Array.isArray(assessment.resolvedSoftFlags) ||
      assessment.resolvedSoftFlags.length > 1 ||
      assessment.resolvedSoftFlags.some((resolution) =>
        resolution === null || typeof resolution !== "object" ||
        resolution.flag !== "rumor_only" ||
        typeof resolution.justification !== "string" || !resolution.justification.trim() ||
        !request.deterministic.flags.includes(resolution.flag) ||
        !validReferences(request, resolution.evidence))) return pending("invalid_result");
  if (review.confidence < 0.8) return pending("low_confidence");
  if (review.decision === "needs_context") return pending("needs_context");
  const resolved = new Set(assessment.resolvedSoftFlags.map(({ flag }) => flag));
  const deterministic = { ...request.deterministic,
    flags: request.deterministic.flags.filter((flag) =>
      flag !== "rumor_only" || !resolved.has(flag)) };
  const merged = policy.mergeWithReview(deterministic, review);
  return finalizeVerdict({ ...merged, qualityScore: review.qualityScore!,
    // Reasons are persisted. Never copy a model's source quotations into logs/output.
    reason: `promotion_assessment:${review.decision}` });
};

const unitScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const validReferences = (
  request: SourceContentQualityReviewRequest, refs: readonly PromotionEvidenceReference[],
): boolean => Array.isArray(refs) && refs.length > 0 && refs.length <= 8 &&
  refs.every((ref: PromotionEvidenceReference) => {
    if (ref === null || typeof ref !== "object" ||
        (ref.field !== "title" && ref.field !== "bodyPreview")) return false;
    const text = request[ref.field] ?? "";
    return Number.isSafeInteger(ref.start) && Number.isSafeInteger(ref.end) &&
      ref.start >= 0 && ref.end > ref.start && ref.end <= text.length &&
      typeof ref.quote === "string" && ref.quote.trim().length > 0 &&
      ref.quote === text.slice(ref.start, ref.end);
  });

const reviewFlags = new Set<string>([
  "crypto_promo", "engagement_bait", "generic_question", "low_information_density",
  "media_only_without_context", "missing_topic_context", "needs_link_context",
  "official_account", "personal_medical_anecdote", "promo_offer",
  "prediction_market_rumor", "rumor_only", "speculative_financial_challenge",
  "trusted_author", "tco_only", "url_only", "weak_topic_match",
]);
