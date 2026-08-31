import {
  type ReaderPostPromotionSelection,
  type SelectedReaderPostPromotion,
} from "../policies/reader-post-promotion-selection";
import {
  evaluateReaderPostPromotion,
  readerPostPromotionTimestampMicros,
  readerPostProviderFamily,
  READER_POST_PROMOTION_POLICY_VERSION,
  type ReaderPostPromotionInput,
  type ReaderPostPromotionResult,
} from "../policies/reader-post-promotion-policy";
import { readerPostPromotionEvidenceConfidence } from
  "../policies/reader-post-promotion-confidence-policy";
import { isTrustedReaderPostPromotionSupport } from
  "../policies/reader-post-promotion-support-authority";
import type { ReaderSummaryEditorialSlate } from
  "../value-objects/reader-summary-editorial-slate";

export const readerPostPromotionSelectionFromEditorialSlate = (
  slate: ReaderSummaryEditorialSlate,
  inputs: readonly ReaderPostPromotionInput[],
): ReaderPostPromotionSelection => {
  const inputById = new Map(inputs.map((input) =>
    [input.candidateId, input] as const));
  const selectedEntries = [...slate.top, ...slate.additional];
  const selectedById = new Map(selectedEntries.map((entry) =>
    [entry.candidateId, entry] as const));
  const materialize = (
    entry: typeof selectedEntries[number],
  ): SelectedReaderPostPromotion => {
    const candidate = inputById.get(entry.candidateId);
    if (candidate === undefined) {
      throw new Error(
        `Editorial slate candidate is missing evidence: ${entry.candidateId}`,
      );
    }
    const support = inputs
      .filter((input) =>
        input.candidateId !== candidate.candidateId &&
        !selectedById.has(input.candidateId) &&
        input.clusterId === candidate.clusterId &&
        isEligibleIndependentSupport(input, candidate),
      )
      .sort((left, right) =>
        left.canonicalIdentity.localeCompare(right.canonicalIdentity) ||
        left.candidateId.localeCompare(right.candidateId),
      );
    const admitted = [candidate, ...support];
    const { providerCount, confidence } =
      readerPostPromotionEvidenceConfidence({ lead: candidate, support });
    return {
      policyVersion: READER_POST_PROMOTION_POLICY_VERSION,
      candidate,
      decision: entry.placement === "top"
        ? "promote_top"
        : "promote_additional",
      normalizedStrength: entry.scoreComponents.total,
      usefulness: entry.scoreComponents.total,
      support,
      providerCount,
      citationIds: uniquePromotionStrings(
        admitted.map((input) => input.citationId),
      ),
      metrics: admitted.flatMap((input) =>
        input.metrics === undefined ? [] : [input.metrics],
      ),
      whyImportant: uniquePromotionStrings(admitted.flatMap((input) =>
        input.whyImportant?.trim() ? [input.whyImportant.trim()] : [],
      )),
      confidence,
      editorialSlateEntry: entry,
    };
  };
  const decision = (
    input: ReaderPostPromotionInput,
  ): ReaderPostPromotionResult => {
    const entry = selectedById.get(input.candidateId);
    if (entry !== undefined) {
      return {
        policyVersion: READER_POST_PROMOTION_POLICY_VERSION,
        candidateId: input.candidateId,
        canonicalIdentity: input.canonicalIdentity,
        decision: entry.placement === "top"
          ? "promote_top"
          : "promote_additional",
        reason: entry.placement === "top"
          ? "top_engagement_floor_met"
          : "additional_engagement_floor_met",
        normalizedStrength: entry.scoreComponents.total,
        authoritativeSameStory: false,
      };
    }
    const semanticSupport = !selectedById.has(input.candidateId) &&
      selectedEntries.some((selectedEntry) => {
        const selectedInput = inputById.get(selectedEntry.candidateId);
        return selectedInput !== undefined &&
          input.clusterId !== undefined &&
          selectedInput.clusterId === input.clusterId &&
          isEligibleIndependentSupport(input, selectedInput);
      });
    return {
      policyVersion: READER_POST_PROMOTION_POLICY_VERSION,
      candidateId: input.candidateId,
      canonicalIdentity: input.canonicalIdentity,
      decision: semanticSupport ? "support_only" : "reject",
      reason: semanticSupport
        ? "authoritative_same_story_support"
        : "quality_gate_failed",
      normalizedStrength: 0,
      authoritativeSameStory: semanticSupport,
    };
  };
  return {
    policyVersion: READER_POST_PROMOTION_POLICY_VERSION,
    top: slate.top.map(materialize),
    additional: slate.additional.map(materialize),
    decisions: inputs.map(decision),
  };
};

/**
 * Slate rematerialization is a second trust boundary: the slate only fixes
 * lead order, it does not attest support. Re-run the complete V1 admission
 * policy for each support candidate with an explicit same-story relation, and
 * require the same exact selection window and source-catalog authority.
 */
const isEligibleIndependentSupport = (
  support: ReaderPostPromotionInput,
  lead: ReaderPostPromotionInput,
): boolean => {
  if (!isTrustedReaderPostPromotionSupport(support) ||
      readerPostProviderFamily(support.provider) === undefined ||
      readerPostProviderFamily(lead.provider) === undefined ||
      readerPostProviderFamily(support.provider) ===
        readerPostProviderFamily(lead.provider) ||
      !sameSelectionWindow(support, lead)) {
    return false;
  }
  const evaluation = evaluateReaderPostPromotion({
    ...support,
    relation: {
      kind: "same_story",
      targetCanonicalIdentity: lead.canonicalIdentity,
      confidence: 1,
      approved: true,
    },
  });
  return evaluation.decision === "support_only" &&
    evaluation.authoritativeSameStory;
};

const sameSelectionWindow = (
  support: ReaderPostPromotionInput,
  lead: ReaderPostPromotionInput,
): boolean => promotionMicros(support, "start") ===
    promotionMicros(lead, "start") &&
  promotionMicros(support, "end") === promotionMicros(lead, "end") &&
  promotionMicros(support, "cutoff") === promotionMicros(lead, "cutoff");

const promotionMicros = (
  input: ReaderPostPromotionInput,
  field: "start" | "end" | "cutoff",
): bigint | undefined => readerPostPromotionTimestampMicros(
  field === "start"
    ? input.exactPeriodStart ?? input.periodStart
    : field === "end"
      ? input.exactPeriodEnd ?? input.periodEnd
      : input.exactIngestionCutoff ?? input.ingestionCutoff,
);

const uniquePromotionStrings = (
  values: readonly string[],
): readonly string[] => [...new Set(values)]
  .filter((value) => value.trim().length > 0)
  .sort((left, right) => left.localeCompare(right));
