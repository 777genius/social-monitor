import {
  readerPostProviderFamily,
  readerPostPromotionTimestampMicros,
  READER_POST_PROMOTION_POLICY_V1,
  type ReaderPostPromotionAttestation,
  type ReaderPostPromotionInput,
} from "../policies/reader-post-promotion-policy";
import { selectReaderPostPromotions } from
  "../policies/reader-post-promotion-selection";
import {
  READER_SUMMARY_EDITORIAL_SLATE_VERSION,
  type ReaderSummaryEditorialSlate,
  type ReaderSummaryEditorialSlateEntry,
} from "../value-objects/reader-summary-editorial-slate";
import {
  buildReaderPostPromotionAttestations,
  canonicalPromotionPayload,
  verifyReaderPostPromotionAttestationDigest,
} from "../services/reader-post-promotion-attestation";
import { readerPostPromotionSelectionFromEditorialSlate } from
  "../services/reader-post-promotion-editorial-slate-selection";
import type { ReaderSummaryArtifactProps } from "./reader-summary-artifact";
import type { TopRead } from "./top-read";
import { sameOrderedValues } from
  "./reader-summary-artifact-validation-values";

// Promotion V1 changed from per-attestation verification to peer-context
// verification without changing its persisted version. Keep the exact legacy
// verifier only for artifacts generated before that rollout boundary.
const PEER_CONTEXT_PROMOTION_ROLLOUT_AT =
  new Date("2026-08-27T20:00:00.000Z");

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
  const editorialSlate = editorialSlateFromCards(props, evidenceFacts);
  const expectedSelection = editorialSlate === undefined
    ? selectReaderPostPromotions(evidenceFacts)
    : readerPostPromotionSelectionFromEditorialSlate(
        editorialSlate,
        evidenceFacts,
      );
  const expected = buildReaderPostPromotionAttestations(
    expectedSelection,
    { artifactId: props.readerSummaryId, sourceWindow: props.sourceWindow },
  );
  if (expected.length !== attestations.length || expected.some((item, index) =>
    item.canonicalPayload !== attestations[index]?.canonicalPayload ||
    item.digest !== attestations[index]?.digest
  )) {
    assertLegacyAttestationsAgainstPersistedEvidence(
      props.generatedAt,
      evidenceFacts,
      attestations,
    );
  }
};

const editorialSlateFromCards = (
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
        card.editorialPolicyVersion !== READER_SUMMARY_EDITORIAL_SLATE_VERSION ||
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
      scoreComponents: result.scoreComponents,
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

const editorialProvider = (
  provider: string,
): ReaderSummaryEditorialSlateEntry["provider"] => {
  const family = readerPostProviderFamily(provider);
  if (family === undefined) {
    throw new Error("Reader card editorial provider is invalid");
  }
  return family === "github_radar" ? "github" : family;
};

const assertLegacyAttestationsAgainstPersistedEvidence = (
  generatedAt: Date | undefined,
  evidenceFacts: readonly ReaderPostPromotionInput[],
  attestations: readonly ReaderPostPromotionAttestation[],
): void => {
  if (generatedAt === undefined ||
      generatedAt.getTime() >= PEER_CONTEXT_PROMOTION_ROLLOUT_AT.getTime()) {
    throw new Error(
      "Reader summary promotion attestation differs from persisted evidence facts",
    );
  }
  const evidenceByCandidateId = new Map(
    evidenceFacts.map((fact) => [fact.candidateId, fact] as const),
  );
  try {
    for (const attestation of attestations) {
      const lead = promotionInputFromAttestation(attestation);
      const persistedLead = evidenceByCandidateId.get(lead.candidateId);
      if (
        persistedLead === undefined ||
        !attestedInputMatchesPersistedFact(lead, persistedLead) ||
        attestation.supportFacts.some((support) => {
          const persistedSupport = evidenceByCandidateId.get(
            support.candidateId,
          );
          return persistedSupport === undefined ||
            canonicalPromotionPayload(persistedSupport) !==
              canonicalPromotionPayload(support);
        })
      ) {
        throw new Error("Legacy promotion evidence is not persistently bound");
      }
      assertLegacyAttestedPolicyDecision(attestation, lead);
    }
  } catch {
    throw new Error(
      "Reader summary promotion attestation differs from persisted evidence facts",
    );
  }
};

const attestedInputMatchesPersistedFact = (
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

const promotionInputFromAttestation = (
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

const assertLegacyAttestedPolicyDecision = (
  attestation: ReaderPostPromotionAttestation,
  lead: ReaderPostPromotionInput,
): void => {
  const selection = selectReaderPostPromotions([
    lead,
    ...attestation.supportFacts,
  ]);
  const expected = attestation.placement === "top"
    ? selection.top[0]
    : selection.additional[0];
  const decision = selection.decisions.find((item) =>
    item.candidateId === attestation.candidateId
  );
  const periodStart = requiredMicros(
    attestation.exactPeriodStart ?? attestation.periodStartedAt,
  );
  const periodEnd = requiredMicros(
    attestation.exactPeriodEnd ?? attestation.periodEndedAt,
  );
  const publishedAt = requiredMicros(
    attestation.exactPublishedAt ?? attestation.publishedAt,
  );
  const duration = periodEnd - periodStart;
  const freshness = duration <= 0n ? 0 : Math.max(0, Math.min(
    1,
    Number(publishedAt - periodStart) / Number(duration),
  ));
  const weights = READER_POST_PROMOTION_POLICY_V1.additionalUsefulnessWeights;
  const expectedComponents = {
    normalizedStrength:
      (decision?.normalizedStrength ?? Number.NaN) * weights.normalizedStrength,
    qualityScore: attestation.qualityScore * weights.qualityScore,
    interestRelevanceScore:
      attestation.relevanceScore * weights.interestRelevanceScore,
    engagementIntegrityScore:
      attestation.integrityScore * weights.engagementIntegrityScore,
    freshness: freshness * weights.freshness,
  };
  if (
    expected?.candidate.candidateId !== attestation.candidateId ||
    expected.decision !== attestation.decision ||
    decision?.reason !== attestation.reason ||
    Object.entries(expectedComponents).some(([key, value]) =>
      Math.abs(value - attestation.usefulnessComponents[
        key as keyof typeof expectedComponents
      ]) > 1e-12
    ) ||
    expected.providerCount !== attestation.providerCount ||
    expected.confidence !== attestation.confidence ||
    !sameOrderedValues(expected.citationIds, attestation.citationIds)
  ) {
    throw new Error("Reader summary legacy promotion decision is invalid");
  }
};

const requiredMicros = (value: Date | string): bigint => {
  const micros = readerPostPromotionTimestampMicros(value);
  if (micros === undefined) {
    throw new Error("Reader summary promotion exact timestamp is invalid");
  }
  return micros;
};
