import {
  readerPostProviderFamily,
  type ReaderPostPromotionAttestation,
  type ReaderPostPromotionInput,
} from "../policies/reader-post-promotion-policy";
import {
  READER_SUMMARY_EDITORIAL_SLATE_VERSION,
  type ReaderSummaryEditorialSlate,
  type ReaderSummaryEditorialSlateEntry,
} from "../value-objects/reader-summary-editorial-slate";
import { canonicalPromotionPayload } from
  "../services/reader-post-promotion-attestation";
import type { ReaderSummaryArtifactProps } from "./reader-summary-artifact";
import type { TopRead } from "./top-read";

export const editorialSlateFromCards = (
  props: ReaderSummaryArtifactProps,
  evidenceFacts: readonly ReaderPostPromotionInput[],
): ReaderSummaryEditorialSlate | undefined => {
  const topCards = (props.content?.topReads ?? []).filter((card) =>
    card.promotionMarker === "reader_post_promotion");
  const additionalCards = (props.content?.selectedPosts ?? []).filter((card) =>
    card.promotionMarker === "reader_post_promotion");
  const cards = [...topCards, ...additionalCards];
  const hasEditorialMetadata = cards.some((card) =>
    card.editorialPolicyVersion !== undefined ||
    card.editorialPlacement !== undefined ||
    card.editorialSlot !== undefined ||
    card.editorialScoreComponents !== undefined ||
    card.editorialReasonCodes !== undefined ||
    card.editorialCandidateDigestInput !== undefined ||
    card.editorialDigestInput !== undefined);
  if (cards.length === 0 || !hasEditorialMetadata) return undefined;
  if (cards.some((card) =>
    card.editorialPolicyVersion === undefined ||
    card.editorialPlacement === undefined ||
    card.editorialSlot === undefined ||
    card.editorialScoreComponents === undefined ||
    card.editorialReasonCodes === undefined ||
    card.editorialCandidateDigestInput === undefined ||
    card.editorialDigestInput === undefined
  )) {
    throw new Error("Reader card editorial slate metadata is incomplete");
  }
  const factById = new Map(evidenceFacts.map((fact) =>
    [fact.candidateId, fact] as const));
  const entry = (
    card: TopRead,
    placement: "top" | "additional",
    index: number,
  ): ReaderSummaryEditorialSlateEntry => {
    const candidateId = card.promotionCandidateId;
    const canonicalIdentity = card.promotionCanonicalIdentity;
    const fact = candidateId === undefined
      ? undefined
      : factById.get(candidateId);
    if (candidateId === undefined || canonicalIdentity === undefined ||
        fact === undefined || card.storyClusterId === undefined ||
        card.editorialPolicyVersion !==
          READER_SUMMARY_EDITORIAL_SLATE_VERSION ||
        card.editorialPlacement !== placement ||
        card.editorialSlot !== index + 1 ||
        card.editorialScoreComponents === undefined ||
        card.editorialReasonCodes === undefined ||
        card.editorialCandidateDigestInput === undefined ||
        card.editorialDigestInput === undefined) {
      throw new Error("Reader card editorial slate metadata is invalid");
    }
    const result: ReaderSummaryEditorialSlateEntry = {
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      placement,
      slot: index + 1,
      candidateId,
      canonicalIdentity,
      provider: editorialProvider(fact.provider),
      storyClusterId: card.storyClusterId,
      scoreComponents: card.editorialScoreComponents,
      reasonCodes: card.editorialReasonCodes,
      candidateDigestInput: card.editorialCandidateDigestInput,
      digestInput: card.editorialDigestInput,
    };
    const digestInput = JSON.stringify({
      policyVersion: result.policyVersion,
      placement: result.placement,
      slot: result.slot,
      candidateId: result.candidateId,
      canonicalIdentity: result.canonicalIdentity,
      provider: result.provider,
      storyClusterId: result.storyClusterId,
      scoreComponents: scoreComponentsDigestValue(result.scoreComponents),
      reasonCodes: result.reasonCodes,
      candidateDigestInput: result.candidateDigestInput,
    });
    if (digestInput !== result.digestInput) {
      throw new Error("Reader card editorial digest input is inconsistent");
    }
    return result;
  };
  const top = topCards.map((card, index) => entry(card, "top", index));
  const additional = additionalCards.map((card, index) =>
    entry(card, "additional", index));
  const entries = [...top, ...additional];
  const selectedCandidateIds = new Set(entries.map((item) =>
    item.candidateId));
  const excluded = evidenceFacts
    .filter((fact) => !selectedCandidateIds.has(fact.candidateId))
    .map((fact) => ({
      candidateId: fact.candidateId,
      canonicalIdentity: fact.canonicalIdentity,
      reasonCodes: ["semantic_story_duplicate"],
    }));
  const digestInputs = entries.map((item) => item.digestInput);
  return {
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    top,
    additional,
    excluded,
    orderedCandidateIds: entries.map((item) => item.candidateId),
    orderedCanonicalIdentities: entries.map(
      (item) => item.canonicalIdentity,
    ),
    digestInputs,
    digestMaterial: JSON.stringify({
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      sourceWindow: {
        windowId: props.sourceWindow.windowId,
        startedAt: props.sourceWindow.startedAt.toISOString(),
        endedAt: props.sourceWindow.endedAt.toISOString(),
        periodStartedAt: (
          props.sourceWindow.periodStartedAt ?? props.sourceWindow.startedAt
        ).toISOString(),
        periodEndedAt: (
          props.sourceWindow.periodEndedAt ?? props.sourceWindow.endedAt
        ).toISOString(),
        ingestionCutoff: (
          props.sourceWindow.ingestionCutoff ?? props.sourceWindow.endedAt
        ).toISOString(),
      },
      orderedCandidateIds: entries.map((item) => item.candidateId),
      orderedCanonicalIdentities: entries.map(
        (item) => item.canonicalIdentity,
      ),
      digestInputs,
    }),
  };
};

const scoreComponentsDigestValue = (
  components: ReaderSummaryEditorialSlateEntry["scoreComponents"],
): ReaderSummaryEditorialSlateEntry["scoreComponents"] => ({
  engagementSalience: components.engagementSalience,
  relevance: components.relevance,
  evidenceQuality: components.evidenceQuality,
  integrity: components.integrity,
  freshness: components.freshness,
  weightedEngagement: components.weightedEngagement,
  weightedRelevance: components.weightedRelevance,
  weightedEvidenceQuality: components.weightedEvidenceQuality,
  weightedIntegrity: components.weightedIntegrity,
  weightedFreshness: components.weightedFreshness,
  total: components.total,
});

const editorialProvider = (
  provider: string,
): ReaderSummaryEditorialSlateEntry["provider"] => {
  const family = readerPostProviderFamily(provider);
  if (family === undefined) {
    throw new Error("Reader card editorial provider is invalid");
  }
  return family === "github_radar" ? "github" : family;
};

export const attestedInputMatchesPersistedFact = (
  attested: ReaderPostPromotionInput,
  persisted: ReaderPostPromotionInput,
): boolean => {
  const comparablePersisted = Object.fromEntries(
    Object.keys(attested).map((key) => [
      key,
      persisted[key as keyof ReaderPostPromotionInput],
    ]).filter(([, value]) => value !== undefined),
  );
  return canonicalPromotionPayload(attested) ===
    canonicalPromotionPayload(comparablePersisted);
};

export const promotionInputFromAttestation = (
  attestation: ReaderPostPromotionAttestation,
): ReaderPostPromotionInput => ({
  candidateId: attestation.candidateId,
  provider: attestation.provider,
  contentKind: attestation.contentKind,
  canonicalIdentity: attestation.canonicalIdentity,
  citationId: attestation.citationId,
  publishedAt: attestation.publishedAt,
  observedAt: attestation.observedAt,
  ...(attestation.exactPublishedAt === undefined ? {} : {
    exactPublishedAt: attestation.exactPublishedAt,
  }),
  ...(attestation.exactObservedAt === undefined ? {} : {
    exactObservedAt: attestation.exactObservedAt,
  }),
  ...(attestation.exactPeriodStart === undefined ? {} : {
    exactPeriodStart: attestation.exactPeriodStart,
  }),
  ...(attestation.exactPeriodEnd === undefined ? {} : {
    exactPeriodEnd: attestation.exactPeriodEnd,
  }),
  ...(attestation.exactIngestionCutoff === undefined ? {} : {
    exactIngestionCutoff: attestation.exactIngestionCutoff,
  }),
  ...(attestation.checkedAt === undefined ? {} : {
    checkedAt: attestation.checkedAt,
  }),
  periodStart: attestation.periodStartedAt,
  periodEnd: attestation.periodEndedAt,
  ingestionCutoff: attestation.ingestionCutoff,
  freshnessValid: attestation.freshnessValid,
  qualityScore: attestation.qualityScore,
  relevanceScore: attestation.relevanceScore,
  integrityScore: attestation.integrityScore,
  qualityValid: attestation.qualityValid,
  safetyValid: attestation.safetyValid,
  citationValid: attestation.citationValid,
  metricsState: attestation.metricsState,
  ...(attestation.metrics === undefined ? {} : {
    metrics: attestation.metrics,
  }),
  ...(attestation.authorityAttestation === undefined ? {} : {
    authorityAttestation: attestation.authorityAttestation,
  }),
  ...(attestation.relationTrace === undefined ? {} : {
    relation: attestation.relationTrace,
  }),
});
