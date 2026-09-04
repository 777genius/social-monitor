import {
  canonicalPromotionPayload,
  promotionPayloadDigest,
} from "../../../domain/services/reader-post-promotion-attestation";
import {
  READER_POST_PROMOTION_POLICY_V1,
  type ReaderPostPromotionAttestationV1,
  type ReaderPostPromotionInput,
} from "../../../domain/policies/reader-post-promotion-policy";
import { selectReaderPostPromotions } from
  "../../../domain/policies/reader-post-promotion-selection";
import { assertReaderSummaryPromotionAttestations } from
  "../../../domain/entities/reader-summary-promotion-attestation-validation";
import {
  readerSummaryArtifact,
  topRead,
} from "./prisma-reader-summary-artifact-fixture.spec-support";

describe("historical V1 confidence verification", () => {
  it("retains the frozen confidence of cross-provider cluster support", () => {
    const fixture = historicalFixture(true);
    // Current V2 calibration intentionally does not trust this support.
    expect(fixture.selection.top[0]).toMatchObject({
      providerCount: 1, confidence: 0.42,
    });
    expect(fixture.attestation).toMatchObject({
      providerCount: 2, confidence: 0.9 + 0.05,
    });
    expect(() => verify(fixture)).not.toThrow();
  });

  it("retains the historical single-source confidence cap", () => {
    const fixture = historicalFixture(false);
    expect(fixture.attestation.confidence).toBe(0.42);
    expect(() => verify(fixture)).not.toThrow();
  });

  it.each([
    ["confidence", { confidence: 1 }],
    ["provider count", { providerCount: 3 }],
    ["support removal", { supportFacts: [] }],
    ["lead metrics", { metrics: {
      provider: "reddit" as const, score: 2001, upvoteRatio: 0.95,
    } }],
  ] as const)("rejects re-digested %s drift", (_label, patch) => {
    const fixture = historicalFixture(true);
    const changed = seal({ ...fixture.attestation, ...patch });
    expect(() => verify(fixture, changed)).toThrow(/promotion attestation/u);
  });

  it("rejects a removed or changed persisted support fact", () => {
    const fixture = historicalFixture(true);
    for (const facts of [
      [fixture.inputs[0]!],
      [fixture.inputs[0]!, {
        ...fixture.inputs[1]!, qualityScore: 0.7,
      }],
    ]) {
      expect(() => assertReaderSummaryPromotionAttestations({
        ...fixture.props, promotionEvidenceFacts: facts,
      }, [fixture.attestation])).toThrow(/promotion attestation/u);
    }
  });
});

const verify = (
  fixture: ReturnType<typeof historicalFixture>,
  attestation = fixture.attestation,
) => assertReaderSummaryPromotionAttestations(
  fixture.props, [attestation],
);

const historicalFixture = (withSupport: boolean) => {
  const base = readerSummaryArtifact("historical-confidence-test").toSnapshot();
  const periodStart = new Date("2026-09-01T00:00:00.000Z");
  const periodEnd = new Date("2026-09-02T00:00:00.000Z");
  const lead: ReaderPostPromotionInput = {
    candidateId: "historical-reddit-lead",
    provider: "reddit",
    contentKind: "original_post",
    canonicalIdentity: "story:historical-lead",
    clusterId: "historical-cluster",
    citationId: "citation-historical-lead",
    publishedAt: new Date("2026-09-01T12:00:00.000Z"),
    observedAt: new Date("2026-09-01T12:05:00.000Z"),
    periodStart,
    periodEnd,
    ingestionCutoff: periodEnd,
    freshnessValid: true,
    qualityScore: 0.9,
    relevanceScore: 0.9,
    integrityScore: 0.9,
    qualityValid: true,
    safetyValid: true,
    citationValid: true,
    metricsState: "observed",
    metrics: { provider: "reddit", score: 2000, upvoteRatio: 0.95 },
  };
  const support: ReaderPostPromotionInput = {
    ...lead,
    candidateId: "historical-hn-support",
    provider: "hacker-news",
    contentKind: "story",
    canonicalIdentity: "story:historical-peer",
    citationId: "citation-historical-peer",
    metrics: { provider: "hacker_news", points: 200 },
  };
  const inputs = withSupport ? [lead, support] : [lead];
  const selection = selectReaderPostPromotions(inputs);
  const selected = selection.top[0]!;
  const weights = READER_POST_PROMOTION_POLICY_V1.additionalUsefulnessWeights;
  const components = {
    normalizedStrength: selected.normalizedStrength * weights.normalizedStrength,
    qualityScore: lead.qualityScore * weights.qualityScore,
    interestRelevanceScore: lead.relevanceScore * weights.interestRelevanceScore,
    engagementIntegrityScore: lead.integrityScore * weights.engagementIntegrityScore,
    freshness: 0.5 * weights.freshness,
  };
  const attestation = seal({
    schemaVersion: "reader_post_promotion_attestation.v1",
    policyVersion: "reader_post_promotion.v1",
    digestVersion: "reader_post_promotion_digest.sha256.v1",
    artifactId: base.readerSummaryId,
    sourceWindowId: base.sourceWindow.windowId,
    periodStartedAt: periodStart,
    periodEndedAt: periodEnd,
    ingestionCutoff: periodEnd,
    placement: "top",
    slot: 0,
    candidateId: lead.candidateId,
    provider: lead.provider,
    contentKind: lead.contentKind,
    canonicalIdentity: lead.canonicalIdentity,
    publishedAt: lead.publishedAt,
    observedAt: lead.observedAt,
    citationId: lead.citationId,
    freshnessValid: true,
    qualityScore: lead.qualityScore,
    relevanceScore: lead.relevanceScore,
    integrityScore: lead.integrityScore,
    qualityValid: true,
    safetyValid: true,
    citationValid: true,
    metricsState: "observed",
    metrics: lead.metrics,
    tier: "top",
    decision: "promote_top",
    reason: "top_engagement_floor_met",
    usefulnessComponents: {
      ...components,
      total: Object.values(components).reduce((sum, value) => sum + value, 0),
    },
    supportFacts: selected.support,
    citationIds: selected.citationIds,
    providerCount: withSupport ? 2 : 1,
    confidence: withSupport ? 0.9 + 0.05 : 0.42,
    canonicalDedupeOutcome: "retained",
    capOutcome: "selected",
  });
  return {
    inputs, selection, attestation,
    props: {
      ...base,
      generatedAt: new Date("2026-09-02T00:20:00.000Z"),
      sourceWindow: {
        ...base.sourceWindow,
        selectedFeedItemIds: inputs.map((input) => input.candidateId),
        periodStartedAt: periodStart,
        periodEndedAt: periodEnd,
        ingestionCutoff: periodEnd,
      },
      promotionEvidenceFacts: inputs,
      promotionAttestations: [attestation],
      citationMap: inputs.map((input) => ({
        ...base.citationMap[0]!,
        citationId: input.citationId,
        feedItemId: input.candidateId,
        providerKey: input.provider,
      })),
      content: {
        ...base.content!,
        selectedPosts: [],
        topReads: [{
          ...topRead(),
          promotionMarker: "reader_post_promotion" as const,
          promotionPolicyVersion: "reader_post_promotion.v1" as const,
          promotionTier: "top" as const,
          promotionCandidateId: lead.candidateId,
          promotionCanonicalIdentity: lead.canonicalIdentity,
          citationIds: selected.citationIds,
        }],
      },
    },
  };
};

const seal = (
  input: Omit<ReaderPostPromotionAttestationV1, "digest" | "canonicalPayload">,
): ReaderPostPromotionAttestationV1 => {
  const body = { ...input } as Record<string, unknown>;
  delete body.digest;
  delete body.canonicalPayload;
  const canonicalPayload = canonicalPromotionPayload(body);
  return { ...input, canonicalPayload, digest: promotionPayloadDigest(canonicalPayload) };
};
