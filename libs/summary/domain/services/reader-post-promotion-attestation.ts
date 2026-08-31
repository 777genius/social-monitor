import { createHash } from "node:crypto";

import type { SummarySourceWindow } from
  "../value-objects/summary-evidence-item";
import type { selectReaderPostPromotions } from
  "../policies/reader-post-promotion-selection";
import {
  READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION,
  READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
  READER_POST_PROMOTION_DIGEST_VERSION,
  type ReaderPostPromotionAttestation,
  type ReaderPostPromotionAttestationV2,
} from "../policies/reader-post-promotion-policy";
import {
  READER_SUMMARY_EDITORIAL_SLATE_VERSION,
  type ReaderSummaryEditorialSlate,
  type ReaderSummaryEditorialSlateEntry,
} from "../value-objects/reader-summary-editorial-slate";

export type ReaderPostPromotionAttestationBinding = {
  readonly artifactId: string;
  readonly sourceWindow: SummarySourceWindow;
  readonly editorialSlate: ReaderSummaryEditorialSlate;
};

export const buildReaderPostPromotionAttestations = (
  selection: ReturnType<typeof selectReaderPostPromotions>,
  binding: ReaderPostPromotionAttestationBinding,
): readonly ReaderPostPromotionAttestationV2[] => {
  const artifactId = binding.artifactId.trim();
  const sourceWindowId = binding.sourceWindow.windowId.trim();
  const periodStartedAt = binding.sourceWindow.periodStartedAt;
  const periodEndedAt = binding.sourceWindow.periodEndedAt;
  const ingestionCutoff = binding.sourceWindow.ingestionCutoff;
  if (artifactId.length === 0 || sourceWindowId.length === 0 ||
      periodStartedAt === undefined || periodEndedAt === undefined ||
      ingestionCutoff === undefined ||
      binding.editorialSlate.policyVersion !==
        READER_SUMMARY_EDITORIAL_SLATE_VERSION) {
    throw new Error("Promotion attestation binding must be complete");
  }
  if (selection.top.length !== binding.editorialSlate.top.length ||
      selection.additional.length !== binding.editorialSlate.additional.length) {
    throw new Error("Promotion attestation selection must match editorial slate");
  }
  const slateDigestInput = binding.editorialSlate.digestMaterial;
  const slateDigest = promotionPayloadDigest(slateDigestInput);
  return [
    ...binding.editorialSlate.top.map((entry, index) => ({
      entry,
      selected: selection.top[index],
      placement: "top" as const,
    })),
    ...binding.editorialSlate.additional.map((entry, index) => ({
      entry,
      selected: selection.additional[index],
      placement: "additional" as const,
    })),
  ].map(({ entry, selected, placement }) => {
    if (selected === undefined ||
        selected.candidate.candidateId !== entry.candidateId ||
        selected.editorialSlateEntry?.digestInput !== entry.digestInput ||
        entry.placement !== placement) {
      throw new Error("Promotion attestation selection order is invalid");
    }
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
      policyVersion: READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION,
      digestVersion: READER_POST_PROMOTION_DIGEST_VERSION,
      artifactId,
      sourceWindowId,
      periodStartedAt,
      periodEndedAt,
      ingestionCutoff,
      placement,
      slot: entry.slot,
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
      usefulnessComponents: usefulnessComponents(entry),
      ...(input.relation === undefined ? {} : { relationTrace: input.relation }),
      supportFacts: selected.support,
      citationIds: selected.citationIds,
      providerCount: selected.providerCount,
      confidence: selected.confidence,
      canonicalDedupeOutcome: "retained" as const,
      capOutcome: "selected" as const,
      storyClusterId: entry.storyClusterId,
      scoreComponents: entry.scoreComponents,
      reasonCodes: entry.reasonCodes,
      candidateDigestInput: entry.candidateDigestInput,
      slateEntryDigestInput: entry.digestInput,
      slateDigestInput,
      slateDigest,
      evidenceLineage: {
        leadCandidateId: input.candidateId,
        leadCitationId: input.citationId,
        supportCandidateIds: selected.support.map((fact) => fact.candidateId),
        supportCitationIds: selected.support.map((fact) => fact.citationId),
        citationIds: selected.citationIds,
      },
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
  entry: ReaderSummaryEditorialSlateEntry,
): ReaderPostPromotionAttestation["usefulnessComponents"] => {
  return {
    normalizedStrength: entry.scoreComponents.weightedEngagement,
    qualityScore: entry.scoreComponents.weightedEvidenceQuality,
    interestRelevanceScore: entry.scoreComponents.weightedRelevance,
    engagementIntegrityScore: entry.scoreComponents.weightedIntegrity,
    freshness: entry.scoreComponents.weightedFreshness,
    total: entry.scoreComponents.total,
  };
};
