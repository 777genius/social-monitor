import type { ReaderPostPromotionAttestation } from
  "../policies/reader-post-promotion-policy";
import { selectReaderPostPromotions } from
  "../policies/reader-post-promotion-selection";
import {
  buildReaderPostPromotionAttestations,
  verifyReaderPostPromotionAttestationDigest,
} from "../services/reader-post-promotion-attestation";
import type { ReaderSummaryArtifactProps } from "./reader-summary-artifact";
import { sameOrderedValues } from
  "./reader-summary-artifact-validation-values";

export const assertReaderSummaryPromotionAttestations = (
  props: ReaderSummaryArtifactProps,
  attestations: readonly ReaderPostPromotionAttestation[],
): void => {
  // Selection placement, semantic dedupe and provider caps depend on the peer
  // candidate set. Recompute that persisted set once instead of re-ranking an
  // individual attestation without its selection context.
  assertAttestationsAgainstPersistedEvidence(props, attestations);
  const candidateIds = new Set<string>();
  for (const attestation of attestations) {
    if (attestation.schemaVersion !== "reader_post_promotion_attestation.v1" ||
        attestation.policyVersion !== "reader_post_promotion.v1" ||
        attestation.digestVersion !== "reader_post_promotion_digest.sha256.v1" ||
        !verifyReaderPostPromotionAttestationDigest(attestation) ||
        attestation.artifactId !== props.readerSummaryId ||
        attestation.sourceWindowId !== props.sourceWindow.windowId ||
        attestation.periodStartedAt.getTime() !==
          props.sourceWindow.periodStartedAt?.getTime() ||
        attestation.periodEndedAt.getTime() !==
          props.sourceWindow.periodEndedAt?.getTime() ||
        attestation.ingestionCutoff.getTime() !==
          props.sourceWindow.ingestionCutoff?.getTime() ||
        attestation.candidateId.trim().length === 0 ||
        attestation.provider.trim().length === 0 ||
        !Number.isFinite(attestation.publishedAt.getTime()) ||
        !Number.isFinite(attestation.observedAt.getTime()) ||
        candidateIds.has(attestation.candidateId)) {
      throw new Error("Reader summary promotion attestation is invalid");
    }
    candidateIds.add(attestation.candidateId);
    const components = attestation.usefulnessComponents;
    const values = [
      components.normalizedStrength,
      components.qualityScore,
      components.interestRelevanceScore,
      components.engagementIntegrityScore,
      components.freshness,
    ];
    const total = values.reduce((sum, value) => sum + value, 0);
    if (values.some((value) => !Number.isFinite(value) || value < 0) ||
        !Number.isFinite(components.total) ||
        Math.abs(total - components.total) > 1e-12) {
      throw new Error("Reader summary promotion usefulness attestation is invalid");
    }
    if (attestation.metrics?.provider === "github_radar" && (
      !Number.isFinite(attestation.metrics.windowStartedAt.getTime()) ||
      !Number.isFinite(attestation.metrics.windowEndedAt.getTime())
    )) {
      throw new Error("Reader summary repository promotion attestation is invalid");
    }
  }
  const promotedCards = [
    ...(props.content?.topReads ?? []).map((card, slot) => ({
      card,
      placement: "top" as const,
      slot,
    })).filter(({ card }) => card.promotionMarker === "reader_post_promotion"),
    ...(props.content?.selectedPosts ?? []).map((card, slot) => ({
      card,
      placement: "additional" as const,
      slot,
    })).filter(({ card }) => card.promotionMarker === "reader_post_promotion"),
  ];
  if (promotedCards.length !== attestations.length) {
    throw new Error(
      `Every Reader card must have exactly one promotion attestation (${promotedCards.length} cards, ${attestations.length} attestations)`,
    );
  }
  for (const { card, placement, slot } of promotedCards) {
    const matches = attestations.filter((attestation) =>
      attestation.candidateId === card.promotionCandidateId &&
      attestation.placement === placement && attestation.slot === slot &&
      attestation.canonicalIdentity === card.promotionCanonicalIdentity &&
      sameOrderedValues(attestation.citationIds, card.citationIds) &&
      attestation.decision === (placement === "top"
        ? "promote_top"
        : "promote_additional"),
    );
    if (matches.length !== 1) {
      throw new Error("Reader card promotion attestation placement is invalid");
    }
  }
};

const assertAttestationsAgainstPersistedEvidence = (
  props: ReaderSummaryArtifactProps,
  attestations: readonly ReaderPostPromotionAttestation[],
): void => {
  const evidenceFacts = props.promotionEvidenceFacts ?? [];
  if (attestations.length === 0) {
    if (evidenceFacts.length !== 0) {
      throw new Error("Promotion evidence facts cannot exist without attestations");
    }
    return;
  }
  const citations = new Map(props.citationMap.map((citation) => [
    citation.citationId,
    citation,
  ] as const));
  const selectedIds = new Set(props.sourceWindow.selectedFeedItemIds);
  if (new Set(evidenceFacts.map((fact) => fact.candidateId)).size !==
      evidenceFacts.length || evidenceFacts.some((fact) => {
        const citation = citations.get(fact.citationId);
        return !selectedIds.has(fact.candidateId) || citation === undefined ||
          citation.feedItemId !== fact.candidateId ||
          citation.providerKey !== fact.provider;
      })) {
    throw new Error("Persisted promotion evidence facts are not citation-bound");
  }
  const expected = buildReaderPostPromotionAttestations(
    selectReaderPostPromotions(evidenceFacts),
    { artifactId: props.readerSummaryId, sourceWindow: props.sourceWindow },
  );
  if (expected.length !== attestations.length || expected.some((item, index) =>
    item.canonicalPayload !== attestations[index]?.canonicalPayload ||
    item.digest !== attestations[index]?.digest
  )) {
    throw new Error(
      "Reader summary promotion attestation differs from persisted evidence facts",
    );
  }
};
