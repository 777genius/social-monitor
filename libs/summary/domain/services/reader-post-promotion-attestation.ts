import { createHash } from "node:crypto";

import type { SummarySourceWindow } from
  "../value-objects/summary-evidence-item";
import type { selectReaderPostPromotions } from
  "../policies/reader-post-promotion-selection";
import {
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
  READER_POST_PROMOTION_DIGEST_VERSION,
  READER_POST_PROMOTION_POLICY_V1,
  readerPostPromotionTimestampMicros,
  type ReaderPostPromotionAttestation,
  type ReaderPostPromotionInput,
} from "../policies/reader-post-promotion-policy";

export type ReaderPostPromotionAttestationBinding = {
  readonly artifactId: string;
  readonly sourceWindow: SummarySourceWindow;
};

export const buildReaderPostPromotionAttestations = (
  selection: ReturnType<typeof selectReaderPostPromotions>,
  binding: ReaderPostPromotionAttestationBinding,
): readonly ReaderPostPromotionAttestation[] => {
  const artifactId = binding.artifactId.trim();
  const sourceWindowId = binding.sourceWindow.windowId.trim();
  const periodStartedAt = binding.sourceWindow.periodStartedAt;
  const periodEndedAt = binding.sourceWindow.periodEndedAt;
  const ingestionCutoff = binding.sourceWindow.ingestionCutoff;
  if (artifactId.length === 0 || sourceWindowId.length === 0 ||
      periodStartedAt === undefined || periodEndedAt === undefined ||
      ingestionCutoff === undefined) {
    throw new Error("Promotion attestation binding must be complete");
  }
  return [
    ...selection.top.map((selected, slot) => ({
      selected,
      placement: "top" as const,
      slot,
    })),
    ...selection.additional.map((selected, slot) => ({
      selected,
      placement: "additional" as const,
      slot,
    })),
  ].map(({ selected, placement, slot }) => {
    const input = selected.candidate;
    const decision = selection.decisions.find(
      (candidate) => candidate.candidateId === input.candidateId,
    );
    if (decision === undefined ||
        decision.decision !== (placement === "top"
          ? "promote_top"
          : "promote_additional")) {
      throw new Error("Selected promotion decision is inconsistent");
    }
    const body = {
      schemaVersion: READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
      policyVersion: decision.policyVersion,
      digestVersion: READER_POST_PROMOTION_DIGEST_VERSION,
      artifactId,
      sourceWindowId,
      periodStartedAt,
      periodEndedAt,
      ingestionCutoff,
      placement,
      slot,
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
        (input.metrics === undefined ? "missing" as const : "observed" as const),
      ...(input.metrics === undefined ? {} : { metrics: input.metrics }),
      ...(input.authorityAttestation === undefined
        ? {}
        : { authorityAttestation: input.authorityAttestation }),
      tier: placement,
      decision: decision.decision,
      reason: decision.reason,
      usefulnessComponents: usefulnessComponents(
        input,
        decision.normalizedStrength,
      ),
      ...(input.relation === undefined ? {} : { relationTrace: input.relation }),
      supportFacts: selected.support,
      citationIds: selected.citationIds,
      providerCount: selected.providerCount,
      confidence: selected.confidence,
      canonicalDedupeOutcome: "retained" as const,
      capOutcome: "selected" as const,
    };
    const canonicalPayload = canonicalPromotionPayload(body);
    return {
      ...body,
      canonicalPayload,
      digest: promotionPayloadDigest(canonicalPayload),
    };
  });
};

export const canonicalPromotionPayload = (value: unknown): string =>
  JSON.stringify(canonicalValue(value));

export const promotionPayloadDigest = (canonicalPayload: string): string =>
  createHash("sha256").update(canonicalPayload, "utf8").digest("hex");

export const verifyReaderPostPromotionAttestationDigest = (
  attestation: ReaderPostPromotionAttestation,
): boolean => {
  const { digest, canonicalPayload, ...body } = attestation;
  return canonicalPayload === canonicalPromotionPayload(body) &&
    digest === promotionPayloadDigest(canonicalPayload);
};

const canonicalValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalValue(nested)]));
  }
  return value;
};

const usefulnessComponents = (
  input: ReaderPostPromotionInput,
  normalizedStrength: number,
): ReaderPostPromotionAttestation["usefulnessComponents"] => {
  const weights = READER_POST_PROMOTION_POLICY_V1.additionalUsefulnessWeights;
  const periodStart = readerPostPromotionTimestampMicros(
    input.exactPeriodStart ?? input.periodStart,
  );
  const periodEnd = readerPostPromotionTimestampMicros(
    input.exactPeriodEnd ?? input.periodEnd,
  );
  const publishedAt = readerPostPromotionTimestampMicros(
    input.exactPublishedAt ?? input.publishedAt,
  );
  const duration = periodStart === undefined || periodEnd === undefined
    ? 0n
    : periodEnd - periodStart;
  const freshness = duration <= 0n || publishedAt === undefined ||
      periodStart === undefined
    ? 0
    : Math.max(0, Math.min(
        1,
        Number(publishedAt - periodStart) / Number(duration),
      ));
  const components = {
    normalizedStrength: weights.normalizedStrength * normalizedStrength,
    qualityScore: weights.qualityScore * input.qualityScore,
    interestRelevanceScore:
      weights.interestRelevanceScore * input.relevanceScore,
    engagementIntegrityScore:
      weights.engagementIntegrityScore * input.integrityScore,
    freshness: weights.freshness * freshness,
  };
  return {
    ...components,
    total: Object.values(components).reduce((sum, value) => sum + value, 0),
  };
};
