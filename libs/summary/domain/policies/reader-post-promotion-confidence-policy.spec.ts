import { readerPostPromotionEvidenceConfidence } from
  "./reader-post-promotion-confidence-policy";
import {
  attestedOfficialAuthority,
  hackerNewsMetrics,
  promotionInput,
} from "./reader-post-promotion-policy.spec-support";

describe("reader post promotion evidence confidence", () => {
  const lead = () => promotionInput({ qualityScore: 0.9 });
  const trustedSupportAuthority = {
    status: "attested" as const,
    official: false,
    trusted: true,
    attestedBy: "source_catalog" as const,
  };

  it("caps one unconfirmed non-official lead at 0.42", () => {
    expect(readerPostPromotionEvidenceConfidence({
      lead: lead(),
      support: [],
    })).toEqual({ providerCount: 1, confidence: 0.42 });
  });

  it("caps one attested official lead at 0.62", () => {
    expect(readerPostPromotionEvidenceConfidence({
      lead: promotionInput({
        qualityScore: 0.9,
        authorityAttestation: attestedOfficialAuthority,
      }),
      support: [],
    })).toEqual({ providerCount: 1, confidence: 0.62 });
  });

  it("caps same-provider support at 0.55", () => {
    expect(readerPostPromotionEvidenceConfidence({
      lead: lead(),
      support: [promotionInput({
        candidateId: "same-provider-support",
        provider: "x-twitter",
        qualityScore: 1,
        authorityAttestation: trustedSupportAuthority,
      })],
    })).toEqual({ providerCount: 1, confidence: 0.55 });
  });

  it("keeps the uncapped quality plus support boost for an independent provider", () => {
    expect(readerPostPromotionEvidenceConfidence({
      lead: lead(),
      support: [promotionInput({
        candidateId: "independent-support",
        provider: "hacker-news",
        contentKind: "story",
        metrics: hackerNewsMetrics(70),
        authorityAttestation: trustedSupportAuthority,
      })],
    })).toEqual({
      providerCount: 2,
      confidence: 0.9500000000000001,
    });
  });

  it.each([
    ["missing", undefined],
    ["untrusted", {
      ...trustedSupportAuthority,
      trusted: false,
    }],
    ["producer-only", {
      ...trustedSupportAuthority,
      attestedBy: "producer" as const,
    }],
    ["malformed", {
      ...trustedSupportAuthority,
      trusted: "yes",
    } as unknown as typeof trustedSupportAuthority],
  ])("keeps the nonofficial 0.42 ceiling for %s support authority", (
    _name,
    authorityAttestation,
  ) => {
    expect(readerPostPromotionEvidenceConfidence({
      lead: lead(),
      support: [promotionInput({
        candidateId: `unsupported-${_name}`,
        provider: "hacker-news",
        contentKind: "story",
        metrics: hackerNewsMetrics(70),
        authorityAttestation,
      })],
    })).toEqual({ providerCount: 1, confidence: 0.42 });
  });
});
