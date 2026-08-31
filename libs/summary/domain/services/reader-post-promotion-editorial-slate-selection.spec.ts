import { promotionInput } from
  "../policies/reader-post-promotion-policy.spec-support";
import { READER_SUMMARY_EDITORIAL_SLATE_VERSION } from
  "../value-objects/reader-summary-editorial-slate";
import { readerPostPromotionSelectionFromEditorialSlate } from
  "./reader-post-promotion-editorial-slate-selection";

describe("reader post promotion editorial slate selection", () => {
  it("retains the single-source confidence cap after V2 ranking", () => {
    const candidate = promotionInput({ qualityScore: 0.9 });
    const entry = {
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      placement: "top" as const,
      slot: 1,
      candidateId: candidate.candidateId,
      canonicalIdentity: candidate.canonicalIdentity,
      provider: "x" as const,
      storyClusterId: "cluster-confidence",
      scoreComponents: {
        engagementSalience: 1,
        relevance: 0.9,
        evidenceQuality: 0.9,
        integrity: 0.8,
        freshness: 0.5,
        weightedEngagement: 0.4,
        weightedRelevance: 0.27,
        weightedEvidenceQuality: 0.135,
        weightedIntegrity: 0.08,
        weightedFreshness: 0.025,
        total: 0.91,
      },
      reasonCodes: ["reader_promotion_v2_admitted"],
      candidateDigestInput: "candidate-digest-input",
      digestInput: "slate-entry-digest-input",
    };
    const selection = readerPostPromotionSelectionFromEditorialSlate({
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      top: [entry],
      additional: [],
      excluded: [],
      orderedCandidateIds: [candidate.candidateId],
      orderedCanonicalIdentities: [candidate.canonicalIdentity],
      digestInputs: [entry.digestInput],
      digestMaterial: "slate-digest-input",
    }, [candidate]);

    expect(selection.top[0]).toMatchObject({
      candidate: { candidateId: candidate.candidateId },
      providerCount: 1,
      confidence: 0.42,
    });
  });
});
