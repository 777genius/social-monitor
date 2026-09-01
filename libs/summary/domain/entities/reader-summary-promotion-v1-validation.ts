import {
  readerPostPromotionTimestampMicros,
  READER_POST_PROMOTION_POLICY_V1,
  type ReaderPostPromotionAttestationV1,
  type ReaderPostPromotionInput,
} from "../policies/reader-post-promotion-policy";
import {
  selectReaderPostPromotions,
  type ReaderPostPromotionSelection,
  type SelectedReaderPostPromotion,
} from "../policies/reader-post-promotion-selection";
import {
  canonicalPromotionPayload,
  promotionPayloadDigest,
} from "../services/reader-post-promotion-attestation";
import { readerPostPromotionSelectionFromEditorialSlate } from
  "../services/reader-post-promotion-editorial-slate-selection";
import type { ReaderSummaryArtifactProps } from "./reader-summary-artifact";
import {
  attestedInputMatchesPersistedFact,
  editorialSlateFromCards,
  promotionInputFromAttestation,
} from "./reader-summary-promotion-editorial-slate-validation";
// V1 peer-context verification rolled out without a schema-version change.
// Keep the pre-rollout per-attestation fallback for already persisted rows.
const PEER_CONTEXT_PROMOTION_ROLLOUT_AT =
  new Date("2026-08-27T20:00:00.000Z");

// Temporary dual-read boundary: V1 is accepted only as an already persisted,
// self-digested historical publication. No V1 construction path exists.
export const assertHistoricalV1EvidenceBinding = (
  props: ReaderSummaryArtifactProps,
  evidenceFacts: readonly ReaderPostPromotionInput[],
  attestations: readonly ReaderPostPromotionAttestationV1[],
): void => {
  const editorialSlate = editorialSlateFromCards(props, evidenceFacts);
  const expectedSelection = editorialSlate === undefined
    ? selectReaderPostPromotions(evidenceFacts)
    : readerPostPromotionSelectionFromEditorialSlate(
        editorialSlate,
        evidenceFacts,
      );
  if (historicalV1AttestationsMatchSelection({
    props,
    selection: expectedSelection,
    attestations,
  })) {
    return;
  }
  assertLegacyV1AttestationsAgainstPersistedEvidence(
    props,
    evidenceFacts,
    attestations,
  );
};

const historicalV1AttestationsMatchSelection = (params: {
  readonly props: ReaderSummaryArtifactProps;
  readonly selection: ReaderPostPromotionSelection;
  readonly attestations: readonly ReaderPostPromotionAttestationV1[];
}): boolean => {
  const expected = [
    ...params.selection.top.map((selected, slot) => ({
      selected,
      placement: "top" as const,
      slot,
    })),
    ...params.selection.additional.map((selected, slot) => ({
      selected,
      placement: "additional" as const,
      slot,
    })),
  ];
  return expected.length === params.attestations.length && expected.every(
    ({ selected, placement, slot }, index) => {
      const attestation = params.attestations[index];
      if (attestation === undefined) return false;
      const body = historicalV1AttestationBody({
        selected,
        selection: params.selection,
        placement,
        slot,
        artifactId: params.props.readerSummaryId,
        sourceWindowId: params.props.sourceWindow.windowId,
        periodStartedAt: params.props.sourceWindow.periodStartedAt,
        periodEndedAt: params.props.sourceWindow.periodEndedAt,
        ingestionCutoff: params.props.sourceWindow.ingestionCutoff,
      });
      if (body === undefined) return false;
      const canonicalPayload = canonicalPromotionPayload(body);
      return attestation.canonicalPayload === canonicalPayload &&
        attestation.digest === promotionPayloadDigest(canonicalPayload);
    },
  );
};

const historicalV1AttestationBody = (params: {
  readonly selected: SelectedReaderPostPromotion;
  readonly selection: ReaderPostPromotionSelection;
  readonly placement: "top" | "additional";
  readonly slot: number;
  readonly artifactId: string;
  readonly sourceWindowId: string;
  readonly periodStartedAt?: Date;
  readonly periodEndedAt?: Date;
  readonly ingestionCutoff?: Date;
}): Omit<ReaderPostPromotionAttestationV1, "canonicalPayload" | "digest"> |
  undefined => {
  const input = params.selected.candidate;
  const decision = params.selection.decisions.find((candidate) =>
    candidate.candidateId === input.candidateId);
  if (decision === undefined || params.periodStartedAt === undefined ||
      params.periodEndedAt === undefined ||
      params.ingestionCutoff === undefined ||
      decision.decision !== (params.placement === "top"
        ? "promote_top"
        : "promote_additional")) {
    return undefined;
  }
  return {
    schemaVersion: "reader_post_promotion_attestation.v1",
    policyVersion: "reader_post_promotion.v1",
    digestVersion: "reader_post_promotion_digest.sha256.v1",
    artifactId: params.artifactId,
    sourceWindowId: params.sourceWindowId,
    periodStartedAt: params.periodStartedAt,
    periodEndedAt: params.periodEndedAt,
    ingestionCutoff: params.ingestionCutoff,
    placement: params.placement,
    slot: params.slot,
    candidateId: input.candidateId,
    provider: input.provider,
    contentKind: input.contentKind,
    canonicalIdentity: decision.canonicalIdentity,
    publishedAt: input.publishedAt,
    observedAt: input.observedAt,
    ...(input.exactPublishedAt === undefined
      ? {}
      : { exactPublishedAt: input.exactPublishedAt }),
    ...(input.exactObservedAt === undefined
      ? {}
      : { exactObservedAt: input.exactObservedAt }),
    ...(input.exactPeriodStart === undefined
      ? {}
      : { exactPeriodStart: input.exactPeriodStart }),
    ...(input.exactPeriodEnd === undefined
      ? {}
      : { exactPeriodEnd: input.exactPeriodEnd }),
    ...(input.exactIngestionCutoff === undefined
      ? {}
      : { exactIngestionCutoff: input.exactIngestionCutoff }),
    ...(input.checkedAt === undefined ? {} : { checkedAt: input.checkedAt }),
    citationId: input.citationId,
    freshnessValid: input.freshnessValid,
    qualityScore: input.qualityScore,
    relevanceScore: input.relevanceScore,
    integrityScore: input.integrityScore,
    qualityValid: input.qualityValid,
    safetyValid: input.safetyValid,
    citationValid: input.citationValid,
    metricsState: input.metricsState ??
      (input.metrics === undefined ? "missing" : "observed"),
    ...(input.metrics === undefined ? {} : { metrics: input.metrics }),
    ...(input.authorityAttestation === undefined
      ? {}
      : { authorityAttestation: input.authorityAttestation }),
    tier: params.placement,
    decision: decision.decision,
    reason: decision.reason,
    usefulnessComponents: historicalV1UsefulnessComponents(
      input,
      decision.normalizedStrength,
    ),
    ...(input.relation === undefined ? {} : { relationTrace: input.relation }),
    supportFacts: params.selected.support,
    citationIds: params.selected.citationIds,
    providerCount: params.selected.providerCount,
    confidence: params.selected.confidence,
    canonicalDedupeOutcome: "retained",
    capOutcome: "selected",
  };
};

const assertLegacyV1AttestationsAgainstPersistedEvidence = (
  props: ReaderSummaryArtifactProps,
  evidenceFacts: readonly ReaderPostPromotionInput[],
  attestations: readonly ReaderPostPromotionAttestationV1[],
): void => {
  if (props.generatedAt === undefined ||
      props.generatedAt.getTime() >= PEER_CONTEXT_PROMOTION_ROLLOUT_AT.getTime()) {
    throw new Error(
      "Reader summary promotion attestation differs from persisted evidence facts",
    );
  }
  const evidenceByCandidateId = new Map(
    evidenceFacts.map((fact) => [fact.candidateId, fact] as const),
  );
  try {
    const boardInputs = new Map<string, ReaderPostPromotionInput>();
    for (const attestation of attestations) {
      const lead = promotionInputFromAttestation(attestation);
      const persistedLead = evidenceByCandidateId.get(lead.candidateId);
      if (persistedLead === undefined ||
          !attestedInputMatchesPersistedFact(lead, persistedLead) ||
          attestation.supportFacts.some((support) => {
            const persistedSupport = evidenceByCandidateId.get(
              support.candidateId,
            );
            return persistedSupport === undefined ||
              canonicalPromotionPayload(persistedSupport) !==
                canonicalPromotionPayload(support);
          })) {
        throw new Error("Legacy promotion evidence is not persistently bound");
      }
      addLegacyBoardInput(boardInputs, lead);
      for (const support of attestation.supportFacts) {
        addLegacyBoardInput(boardInputs, support);
      }
    }
    const frozenSelection = selectReaderPostPromotions(
      [...boardInputs.values()],
    );
    if (!historicalV1AttestationsMatchSelection({
      props,
      selection: frozenSelection,
      attestations,
    })) {
      throw new Error("Reader summary legacy promotion board is invalid");
    }
  } catch {
    throw new Error(
      "Reader summary promotion attestation differs from persisted evidence facts",
    );
  }
};

const addLegacyBoardInput = (
  inputs: Map<string, ReaderPostPromotionInput>,
  input: ReaderPostPromotionInput,
): void => {
  const current = inputs.get(input.candidateId);
  if (current !== undefined &&
      canonicalPromotionPayload(current) !== canonicalPromotionPayload(input)) {
    throw new Error("Reader summary legacy promotion board is inconsistent");
  }
  inputs.set(input.candidateId, input);
};

const historicalV1UsefulnessComponents = (
  input: ReaderPostPromotionInput,
  normalizedStrength: number,
): ReaderPostPromotionAttestationV1["usefulnessComponents"] => {
  const periodStart = requiredMicros(
    input.exactPeriodStart ?? input.periodStart,
  );
  const periodEnd = requiredMicros(input.exactPeriodEnd ?? input.periodEnd);
  const publishedAt = requiredMicros(
    input.exactPublishedAt ?? input.publishedAt,
  );
  const duration = periodEnd - periodStart;
  const freshness = duration <= 0n ? 0 : Math.max(0, Math.min(
    1,
    Number(publishedAt - periodStart) / Number(duration),
  ));
  const weights = READER_POST_PROMOTION_POLICY_V1.additionalUsefulnessWeights;
  const components = {
    normalizedStrength: normalizedStrength * weights.normalizedStrength,
    qualityScore: input.qualityScore * weights.qualityScore,
    interestRelevanceScore:
      input.relevanceScore * weights.interestRelevanceScore,
    engagementIntegrityScore:
      input.integrityScore * weights.engagementIntegrityScore,
    freshness: freshness * weights.freshness,
  };
  return {
    ...components,
    total: Object.values(components).reduce((sum, value) => sum + value, 0),
  };
};

const requiredMicros = (value: Date | string): bigint => {
  const micros = readerPostPromotionTimestampMicros(value);
  if (micros === undefined) {
    throw new Error("Reader summary promotion exact timestamp is invalid");
  }
  return micros;
};
