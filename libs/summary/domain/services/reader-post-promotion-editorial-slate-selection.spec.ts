import type { ReaderPostPromotionInput } from
  "../policies/reader-post-promotion-policy";
import type { ReaderSummaryEditorialSlate } from
  "../value-objects/reader-summary-editorial-slate";
import { readerPostPromotionSelectionFromEditorialSlate } from
  "./reader-post-promotion-editorial-slate-selection";

describe("Reader Promotion V2 trusted independent support", () => {
  it.each([
    ["missing", undefined],
    ["untrusted", {
      status: "attested" as const,
      official: false,
      trusted: false,
      attestedBy: "source_catalog" as const,
    }],
    ["malformed", {
      status: "attested" as const,
      official: false,
      trusted: "yes",
      attestedBy: "source_catalog" as const,
    } as unknown as ReaderPostPromotionInput["authorityAttestation"]],
  ])("does not let %s authority lift the nonofficial 0.42 ceiling", (
    _name,
    authorityAttestation,
  ) => {
    const selection = selectWithSupport(authorityAttestation);

    expect(selection.top[0]).toMatchObject({
      providerCount: 1,
      confidence: 0.42,
      support: [],
    });
    expect(selection.decisions).toContainEqual(expect.objectContaining({
      candidateId: "support-hn",
      decision: "reject",
      authoritativeSameStory: false,
    }));
  });

  it("admits trusted source-catalog-attested cross-provider corroboration", () => {
    const selection = selectWithSupport({
      status: "attested",
      official: false,
      trusted: true,
      attestedBy: "source_catalog",
    });

    expect(selection.top[0]).toMatchObject({
      providerCount: 2,
      confidence: 1,
      support: [expect.objectContaining({ candidateId: "support-hn" })],
    });
    expect(selection.decisions).toContainEqual(expect.objectContaining({
      candidateId: "support-hn",
      decision: "support_only",
      authoritativeSameStory: true,
    }));
  });
});

const selectWithSupport = (
  authorityAttestation: ReaderPostPromotionInput["authorityAttestation"],
) => readerPostPromotionSelectionFromEditorialSlate(slate, [
  input("lead-reddit", "reddit", "original_post", {
    provider: "reddit",
    score: 500,
    upvoteRatio: 0.9,
  }),
  {
    ...input("support-hn", "hacker-news", "story", {
      provider: "hacker_news",
      points: 100,
    }),
    authorityAttestation,
  },
]);

const input = (
  candidateId: string,
  provider: string,
  contentKind: "original_post" | "story",
  metrics: ReaderPostPromotionInput["metrics"],
): ReaderPostPromotionInput => ({
  candidateId,
  provider,
  contentKind,
  canonicalIdentity: `story:${candidateId}`,
  citationId: `citation:${candidateId}`,
  publishedAt: new Date("2026-08-29T12:00:00.000Z"),
  observedAt: new Date("2026-08-29T12:05:00.000Z"),
  periodStart: new Date("2026-08-29T00:00:00.000Z"),
  periodEnd: new Date("2026-08-30T00:00:00.000Z"),
  ingestionCutoff: new Date("2026-08-29T18:00:00.000Z"),
  freshnessValid: true,
  qualityScore: 0.95,
  relevanceScore: 0.9,
  integrityScore: 0.9,
  qualityValid: true,
  safetyValid: true,
  citationValid: true,
  metricsState: "observed",
  metrics,
  clusterId: "cluster:trusted-support",
});

const components = {
  engagementSalience: 0.5,
  relevance: 0.9,
  evidenceQuality: 0.95,
  integrity: 0.9,
  freshness: 0.5,
  weightedEngagement: 0.2,
  weightedRelevance: 0.27,
  weightedEvidenceQuality: 0.1425,
  weightedIntegrity: 0.09,
  weightedFreshness: 0.025,
  total: 0.7275,
};

const slate: ReaderSummaryEditorialSlate = {
  policyVersion: "reader_promotion_policy.v2",
  top: [{
    policyVersion: "reader_promotion_policy.v2",
    placement: "top",
    slot: 1,
    candidateId: "lead-reddit",
    canonicalIdentity: "story:lead-reddit",
    provider: "reddit",
    storyClusterId: "cluster:trusted-support",
    scoreComponents: components,
    reasonCodes: ["reader_promotion_v2_admitted"],
    candidateDigestInput: "candidate-digest",
    digestInput: "entry-digest",
  }],
  additional: [],
  excluded: [],
  orderedCandidateIds: ["lead-reddit"],
  orderedCanonicalIdentities: ["story:lead-reddit"],
  digestInputs: ["entry-digest"],
  digestMaterial: "slate-digest",
};
