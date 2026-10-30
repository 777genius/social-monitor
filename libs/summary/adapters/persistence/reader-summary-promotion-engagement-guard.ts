import type { JsonObject } from "@social-monitor/shared-kernel";

import {
  canonicalPromotionPayload,
  readerPostPromotionMetricMature,
  readerPostPromotionPopularityByCandidate,
  readerPromotionSemanticallyAdmitted,
  readerPromotionSourceForProviderKey,
  type ReaderPostPromotionAttestationAny,
  type ReaderPostPromotionEngagement,
} from "../../domain";
import { readerPostPromotionEngagementFact } from
  "../evidence/reader-post-promotion-engagement-facts";

/**
 * The signed engagement must be exactly the fact frozen in the manifest:
 * value from the frozen provider metadata, observation time from the frozen
 * engagement snapshot. A manifest without the frozen time never matches.
 */
export const frozenEngagementMatchesAttestation = (
  candidate: unknown,
  attestation: ReaderPostPromotionAttestationAny,
): boolean => {
  if (attestation.schemaVersion !== "reader_post_promotion_attestation.v3") return false;
  const expected = frozenEngagement(candidate);
  return expected !== "missing" && canonicalPromotionPayload(expected) ===
    canonicalPromotionPayload(attestation.comparator.engagement);
};

/**
 * Popularity counts are relative to the whole frozen cohort, which a reader
 * of the artifact cannot see. The publication guard can: it recomputes the
 * cohort from every frozen candidate and its locked assessment (same gate as
 * promotion) and requires each signed count to match.
 */
export const frozenPopularityMatchesAttestations = (params: {
  readonly candidates: readonly unknown[];
  readonly assessmentFor: (candidate: Record<string, unknown>) =>
    { readonly result: unknown; readonly input_snapshot: unknown } | undefined;
  readonly period: { readonly startedAt: Date; readonly endedAt: Date };
  readonly attestations: readonly ReaderPostPromotionAttestationAny[];
}): boolean => {
  // Nothing is signed on a no-signal board, so there is nothing to bind.
  if (params.attestations.length === 0) return true;
  const cohort = [];
  for (const value of params.candidates) {
    const candidate = record(value);
    const assessment = candidate === undefined ? undefined : params.assessmentFor(candidate);
    const engagement = frozenEngagement(candidate);
    if (candidate === undefined || assessment === undefined || engagement === "missing") {
      return false;
    }
    const source = readerPromotionSourceForProviderKey(String(candidate.providerKey));
    const published = Date.parse(String(candidate.publishedAt));
    if (engagement === null || source?.engagementClass !== "ranked" ||
        !gatePassed(candidate, assessment, published, params.period) ||
        !readerPostPromotionMetricMature(engagement, String(candidate.publishedAt))) continue;
    cohort.push({ candidateId: String(candidate.candidateId),
      sourceItemId: String(candidate.sourceItemId), providerFamily: source.family,
      value: engagement.value });
  }
  const popularity = readerPostPromotionPopularityByCandidate(cohort);
  return params.attestations.every((attestation) =>
    attestation.schemaVersion === "reader_post_promotion_attestation.v3" &&
    canonicalPromotionPayload(popularity.get(attestation.candidateId) ?? null) ===
      canonicalPromotionPayload(attestation.comparator.popularity));
};

/** Mirrors the promotion gate: semantic admission plus technical validity. */
const gatePassed = (
  candidate: Record<string, unknown>,
  assessment: { readonly result: unknown; readonly input_snapshot: unknown },
  published: number,
  period: { readonly startedAt: Date; readonly endedAt: Date },
): boolean => {
  const answers = record(assessment.result);
  const usefulness = record(answers?.usefulness)?.choice;
  const relevance = record(answers?.relevance)?.choice;
  return typeof usefulness === "string" && typeof relevance === "string" &&
    readerPromotionSemanticallyAdmitted({ usefulness, relevance } as Parameters<
      typeof readerPromotionSemanticallyAdmitted>[0]) &&
    candidate.sourceKind !== "trending_repository" &&
    typeof candidate.canonicalIdentity === "string" &&
    candidate.canonicalIdentity.trim().length > 0 &&
    Number.isFinite(published) && published >= period.startedAt.getTime() &&
    published < period.endedAt.getTime() &&
    record(assessment.input_snapshot)?.safety !== "blocked";
};

const frozenEngagement = (
  value: unknown,
): ReaderPostPromotionEngagement | null | "missing" => {
  const frozen = record(value);
  const observedAt = frozen?.engagementObservedAt;
  if (frozen === undefined || !Object.hasOwn(frozen, "engagementObservedAt") ||
      (observedAt !== null && typeof observedAt !== "string") ||
      typeof frozen.providerKey !== "string") return "missing";
  const metadata = record(frozen.providerMetadata);
  return readerPostPromotionEngagementFact({
    providerKey: frozen.providerKey,
    ...(metadata === undefined ? {} : { providerMetadata: metadata as JsonObject }),
    engagementObservedAt: observedAt as string | null,
  });
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
