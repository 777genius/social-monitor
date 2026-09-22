import { assertReaderDisplayIdentity } from "../services/reader-post-display-identity";

import {
  type ReaderPostPromotionAttestation,
  type ReaderPostPromotionAttestationAny,
  type ReaderPostPromotionAttestationV1,
  type ReaderPostPromotionAttestationV2,
} from "../policies/reader-post-promotion-policy";
import { READER_SUMMARY_EDITORIAL_SLATE_VERSION } from
  "../value-objects/reader-summary-editorial-slate";
import {
  canonicalPromotionPayload,
  promotionPayloadDigest,
  verifyReaderPostPromotionAttestationDigest,
} from "../services/reader-post-promotion-attestation";
import type { ReaderSummaryArtifactProps } from "./reader-summary-artifact";
import { sameOrderedValues } from
  "./reader-summary-artifact-validation-values";
import {
  attestedInputMatchesPersistedFact,
  editorialSlateFromCards,
  promotionInputFromAttestation,
} from "./reader-summary-promotion-editorial-slate-validation";
import { assertHistoricalV1EvidenceBinding } from
  "./reader-summary-promotion-v1-validation";
import type { TopRead } from "./top-read";
import { validateReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import { readerPostPresentationV3Identity, readerPostPresentationV3MatchesCard } from
  "../services/reader-post-presentation-v3";

export const assertReaderSummaryPromotionAttestations = (
  props: ReaderSummaryArtifactProps,
  attestations: readonly ReaderPostPromotionAttestationAny[],
): void => {
  const v3 = attestations.filter((attestation) =>
    attestation.schemaVersion === "reader_post_promotion_attestation.v3");
  if (v3.length > 0) {
    if (v3.length !== attestations.length) {
      throw new Error("Reader summary promotion attestation versions cannot be mixed");
    }
    assertV3Attestations(props, v3);
    return;
  }
  const legacy = attestations as readonly ReaderPostPromotionAttestation[];
  const v1 = legacy.filter(isPromotionAttestationV1);
  const v2 = legacy.filter(isPromotionAttestationV2);
  if (v1.length + v2.length !== legacy.length ||
      (v1.length > 0 && v2.length > 0)) {
    throw new Error("Reader summary promotion attestation version is invalid");
  }
  assertAttestationsAgainstPersistedEvidence(props, legacy);
  const candidateIds = new Set<string>();
  for (const attestation of legacy) {
    if (!validPromotionVersionTuple(attestation) ||
        !/^[0-9a-f]{64}$/u.test(attestation.digest) ||
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
        !Number.isSafeInteger(attestation.slot) ||
        attestation.slot < (isPromotionAttestationV2(attestation) ? 1 : 0) ||
        attestation.tier !== attestation.placement ||
        attestation.canonicalDedupeOutcome !== "retained" ||
        attestation.capOutcome !== "selected" ||
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
      throw new Error(
        "Reader summary promotion usefulness attestation is invalid",
      );
    }
    if (attestation.metrics?.provider === "github_radar" && (
      !Number.isFinite(attestation.metrics.windowStartedAt.getTime()) ||
      !Number.isFinite(attestation.metrics.windowEndedAt.getTime())
    )) {
      throw new Error(
        "Reader summary repository promotion attestation is invalid",
      );
    }
    if (isPromotionAttestationV2(attestation)) {
      assertV2AttestationFields(attestation);
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
  if (promotedCards.length !== legacy.length) {
    throw new Error(
      `Every Reader card must have exactly one promotion attestation (${promotedCards.length} cards, ${legacy.length} attestations)`,
    );
  }
  for (const { card, placement, slot } of promotedCards) {
    const matches = legacy.filter((attestation) =>
      card.promotionMarker === "reader_post_promotion" &&
      card.promotionPolicyVersion === (isPromotionAttestationV1(attestation)
        ? "reader_post_promotion.v1"
        : attestation.policyVersion) &&
      card.promotionTier === placement &&
      attestation.candidateId === card.promotionCandidateId &&
      attestation.placement === placement &&
      attestation.slot === promotionSlot(attestation, slot) &&
      attestation.canonicalIdentity === card.promotionCanonicalIdentity &&
      sameOrderedValues(attestation.citationIds, card.citationIds) &&
      attestation.decision === (placement === "top"
        ? "promote_top"
        : "promote_additional"),
    );
    if (matches.length === 1 && isPromotionAttestationV2(matches[0]!) &&
        !v2AttestationMatchesCard(matches[0]!, card, placement, slot)) {
      throw new Error("Reader card promotion attestation placement is invalid");
    }
    if (matches.length === 1) {
      assertReaderDisplayIdentity(card, matches[0]!, props);
      const headline = card.displayHeadline;
      if (headline?.status === "accepted" && !props.citationMap.some((citation) =>
        citation.citationId === matches[0]!.citationId &&
        citation.sourceItemId === headline.binding.sourceItemId)) {
        throw new Error("Reader promotion display source citation is invalid");
      }
    }
    if (matches.length !== 1) {
      throw new Error("Reader card promotion attestation placement is invalid");
    }
  }
};

const assertV3Attestations = (
  props: ReaderSummaryArtifactProps,
  attestations: readonly Extract<ReaderPostPromotionAttestationAny,
    { readonly schemaVersion: "reader_post_promotion_attestation.v3" }>[],
): void => {
  if ((props.promotionEvidenceFacts ?? []).length !== 0) {
    throw new Error("Promotion V3 must not persist legacy score facts");
  }
  const cards = [
    ...(props.content?.topReads ?? []).map((card, index) => ({ card, placement: "top" as const, slot: index + 1 })),
    ...(props.content?.selectedPosts ?? []).map((card, index) => ({ card, placement: "additional" as const, slot: index + 1 })),
  ].filter(({ card }) => card.promotionMarker === "reader_post_promotion");
  if (cards.length !== attestations.length) {
    throw new Error("Every Promotion V3 card requires one attestation");
  }
  const candidateIds = new Set<string>();
  for (const [index, attestation] of attestations.entries()) {
    const bound = cards[index];
    const assessment = attestation.assessment;
    const answers = validateReaderValueAnswers(assessment.answers);
    if (bound === undefined ||
        attestation.policyVersion !== "reader_post_promotion.v3" ||
        attestation.digestVersion !== "reader_post_promotion_digest.sha256.v3" ||
        !verifyReaderPostPromotionAttestationDigest(attestation) ||
        attestation.artifactId !== props.readerSummaryId ||
        attestation.sourceWindowId !== props.sourceWindow.windowId ||
        attestation.periodStartedAt.getTime() !== props.sourceWindow.periodStartedAt?.getTime() ||
        attestation.periodEndedAt.getTime() !== props.sourceWindow.periodEndedAt?.getTime() ||
        attestation.ingestionCutoff.getTime() !== props.sourceWindow.ingestionCutoff?.getTime() ||
        attestation.exactIngestionCutoff !== props.sourceWindow.exactIngestionCutoff ||
        Date.parse(attestation.exactIngestionCutoff) !== attestation.ingestionCutoff.getTime() ||
        attestation.placement !== bound.placement || attestation.slot !== bound.slot ||
        attestation.candidateId !== bound.card.promotionCandidateId ||
        attestation.provider !== bound.card.providerKey ||
        attestation.canonicalIdentity !== bound.card.promotionCanonicalIdentity ||
        bound.card.promotionPolicyVersion !== "reader_post_promotion.v3" ||
        attestation.storyId !== bound.card.storyClusterId ||
        candidateIds.has(attestation.candidateId) ||
        !/^[0-9a-f]{64}$/u.test(assessment.sourceSnapshotSha256) ||
        !/^[0-9a-f]{64}$/u.test(assessment.inputSha256) ||
        !/^[0-9a-f]{64}$/u.test(assessment.rubricSha256) ||
        !/^[0-9a-f]{64}$/u.test(attestation.presentation.presentationInputDigest) ||
        attestation.presentation.presentationIdentity !== readerPostPresentationV3Identity({
          sourceSnapshotSha256: assessment.sourceSnapshotSha256,
          presentationInputDigest: attestation.presentation.presentationInputDigest,
          displayHeadline: attestation.presentation.displayHeadline,
        }) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(
          assessment.assessedAt) ||
        !Number.isFinite(Date.parse(assessment.assessedAt)) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(
          attestation.publishedAt) ||
        !Number.isFinite(Date.parse(attestation.publishedAt)) || !answers.ok ||
        attestation.comparator.usefulness !== assessment.answers.usefulness.choice ||
        attestation.comparator.relevance !== assessment.answers.relevance.choice ||
        attestation.comparator.publishedAt !== attestation.publishedAt ||
        attestation.comparator.candidateId !== attestation.candidateId ||
        !["useful", "important"].includes(assessment.answers.usefulness.choice) ||
        !["relevant", "central"].includes(assessment.answers.relevance.choice) ||
        !sameOrderedValues(attestation.citationIds, bound.card.citationIds) ||
        attestation.presentation.displayHeadline.headline.status !== "accepted" ||
        canonicalPromotionPayload(attestation.presentation.displayHeadline.headline) !==
          canonicalPromotionPayload(bound.card.displayHeadline) ||
        !readerPostPresentationV3MatchesCard({
          title: bound.card.title,
          providerKey: bound.card.providerKey,
          candidateId: bound.card.promotionCandidateId,
          capturedSource: bound.card.capturedSource,
          headline: bound.card.displayHeadline,
          seal: attestation.presentation.displayHeadline,
          tenantId: props.tenantId,
          workspaceId: props.workspaceId,
        }) || bound.card.exactPublishedAt !== attestation.publishedAt) {
      throw new Error("Reader summary Promotion V3 attestation is invalid");
    }
    candidateIds.add(attestation.candidateId);
  }
  for (const placement of ["top", "additional"] as const) {
    const ordered = attestations.filter((value) => value.placement === placement);
    if (ordered.some((value, index) => index > 0 &&
        compareV3Attestation(ordered[index - 1]!, value) > 0)) {
      throw new Error("Reader summary Promotion V3 order is invalid");
    }
  }
};

const compareV3Attestation = (
  left: Extract<ReaderPostPromotionAttestationAny,
    { readonly schemaVersion: "reader_post_promotion_attestation.v3" }>,
  right: Extract<ReaderPostPromotionAttestationAny,
    { readonly schemaVersion: "reader_post_promotion_attestation.v3" }>,
): number => {
  const usefulness = { important: 3, useful: 2, context: 1, noise: 0,
    insufficient_context: -1 } as const;
  const relevance = { central: 3, relevant: 2, adjacent: 1, unrelated: 0,
    insufficient_context: -1 } as const;
  return usefulness[right.comparator.usefulness] -
    usefulness[left.comparator.usefulness] ||
    relevance[right.comparator.relevance] - relevance[left.comparator.relevance] ||
    Buffer.compare(Buffer.from(right.publishedAt), Buffer.from(left.publishedAt)) ||
    Buffer.compare(Buffer.from(left.candidateId), Buffer.from(right.candidateId));
};

const isPromotionAttestationV1 = (
  attestation: ReaderPostPromotionAttestation,
): attestation is ReaderPostPromotionAttestationV1 =>
  attestation.schemaVersion === "reader_post_promotion_attestation.v1";

const isPromotionAttestationV2 = (
  attestation: ReaderPostPromotionAttestation,
): attestation is ReaderPostPromotionAttestationV2 =>
  attestation.schemaVersion === "reader_post_promotion_attestation.v2";

const validPromotionVersionTuple = (
  attestation: ReaderPostPromotionAttestation,
): boolean => isPromotionAttestationV1(attestation)
  ? attestation.policyVersion === "reader_post_promotion.v1" &&
    attestation.digestVersion === "reader_post_promotion_digest.sha256.v1"
  : isPromotionAttestationV2(attestation) &&
    attestation.policyVersion === "reader_post_promotion.v2" &&
    attestation.digestVersion === "reader_post_promotion_digest.sha256.v2";

const promotionSlot = (
  attestation: ReaderPostPromotionAttestation,
  zeroBasedIndex: number,
): number => isPromotionAttestationV2(attestation)
  ? zeroBasedIndex + 1
  : zeroBasedIndex;

const assertV2AttestationFields = (
  attestation: ReaderPostPromotionAttestationV2,
): void => {
  const components = attestation.scoreComponents;
  const weighted = [
    components.weightedEngagement,
    components.weightedRelevance,
    components.weightedEvidenceQuality,
    components.weightedIntegrity,
    components.weightedFreshness,
  ];
  const raw = [
    components.engagementSalience,
    components.relevance,
    components.evidenceQuality,
    components.integrity,
    components.freshness,
  ];
  const lineage = attestation.evidenceLineage;
  if (attestation.storyClusterId.trim().length === 0 ||
      attestation.reasonCodes.length === 0 ||
      new Set(attestation.reasonCodes).size !==
        attestation.reasonCodes.length ||
      attestation.reasonCodes.some((code) => code.trim().length === 0) ||
      attestation.candidateDigestInput.trim().length === 0 ||
      attestation.slateEntryDigestInput.trim().length === 0 ||
      attestation.slateDigestInput.trim().length === 0 ||
      !/^[0-9a-f]{64}$/u.test(attestation.slateDigest) ||
      promotionPayloadDigest(attestation.slateDigestInput) !==
        attestation.slateDigest ||
      raw.some((value) =>
        !Number.isFinite(value) || value < 0 || value > 1) ||
      weighted.some((value) => !Number.isFinite(value) || value < 0) ||
      !Number.isFinite(components.total) || components.total < 0 ||
      Math.abs(weighted.reduce((sum, value) => sum + value, 0) -
        components.total) > 1e-12 ||
      lineage.leadCandidateId !== attestation.candidateId ||
      lineage.leadCitationId !== attestation.citationId ||
      !sameOrderedValues(
        lineage.supportCandidateIds,
        attestation.supportFacts.map((fact) => fact.candidateId),
      ) ||
      !sameOrderedValues(
        lineage.supportCitationIds,
        attestation.supportFacts.map((fact) => fact.citationId),
      ) ||
      !sameOrderedValues(lineage.citationIds, attestation.citationIds)) {
    throw new Error("Reader summary Promotion V2 attestation is invalid");
  }
};

const v2AttestationMatchesCard = (
  attestation: ReaderPostPromotionAttestationV2,
  card: TopRead,
  placement: "top" | "additional",
  zeroBasedIndex: number,
): boolean => card.storyClusterId === attestation.storyClusterId &&
  card.promotionPolicyVersion === attestation.policyVersion &&
  card.editorialPolicyVersion === READER_SUMMARY_EDITORIAL_SLATE_VERSION &&
  card.editorialPlacement === placement &&
  card.editorialSlot === zeroBasedIndex + 1 &&
  canonicalPromotionPayload(card.editorialScoreComponents) ===
    canonicalPromotionPayload(attestation.scoreComponents) &&
  sameOrderedValues(card.editorialReasonCodes ?? [], attestation.reasonCodes) &&
  card.editorialCandidateDigestInput === attestation.candidateDigestInput &&
  card.editorialDigestInput === attestation.slateEntryDigestInput;

const assertAttestationsAgainstPersistedEvidence = (
  props: ReaderSummaryArtifactProps,
  attestations: readonly ReaderPostPromotionAttestation[],
): void => {
  const evidenceFacts = props.promotionEvidenceFacts ?? [];
  if (attestations.length === 0) {
    if (evidenceFacts.length !== 0) {
      throw new Error(
        "Promotion evidence facts cannot exist without attestations",
      );
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
    throw new Error(
      "Persisted promotion evidence facts are not citation-bound",
    );
  }
  if (attestations.every(isPromotionAttestationV1)) {
    assertHistoricalV1EvidenceBinding(props, evidenceFacts, attestations);
    return;
  }
  if (!attestations.every(isPromotionAttestationV2)) {
    throw new Error("Reader summary promotion attestation version is invalid");
  }
  const editorialSlate = editorialSlateFromCards(props, evidenceFacts);
  if (editorialSlate === undefined) {
    throw new Error(
      "Promotion V2 attestation requires editorial slate metadata",
    );
  }
  const entries = [...editorialSlate.top, ...editorialSlate.additional];
  const evidenceByCandidateId = new Map(evidenceFacts.map((fact) =>
    [fact.candidateId, fact] as const));
  if (entries.length !== attestations.length || attestations.some(
    (attestation, index) => {
      const entry = entries[index];
      const persistedLead = evidenceByCandidateId.get(
        attestation.candidateId,
      );
      return entry === undefined || persistedLead === undefined ||
        entry.candidateId !== attestation.candidateId ||
        entry.placement !== attestation.placement ||
        entry.slot !== attestation.slot ||
        entry.digestInput !== attestation.slateEntryDigestInput ||
        editorialSlate.digestMaterial !== attestation.slateDigestInput ||
        !attestedInputMatchesPersistedFact(
          promotionInputFromAttestation(attestation),
          persistedLead,
        ) ||
        attestation.supportFacts.some((support) => {
          const persistedSupport = evidenceByCandidateId.get(
            support.candidateId,
          );
          return persistedSupport === undefined ||
            canonicalPromotionPayload(persistedSupport) !==
              canonicalPromotionPayload(support);
        });
    },
  )) {
    throw new Error(
      "Reader summary promotion attestation differs from persisted evidence facts",
    );
  }
};
