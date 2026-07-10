import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  firstPartyPublicationBurstKey,
  hasFirstPartyOfficialEvidence,
  isFirstPartyOfficialQuality,
} from "./reader-summary-source-authority-policy";

describe("reader summary source authority policy", () => {
  it("recognizes eligible first-party official evidence", () => {
    expect(
      hasFirstPartyOfficialEvidence([
        evidence({ flags: ["official_account", "trusted_author"] }),
      ]),
    ).toBe(true);
  });

  it("does not trust flags on evidence that is ineligible for top reads", () => {
    expect(
      hasFirstPartyOfficialEvidence([
        evidence({
          eligibleForTopRead: false,
          flags: ["official_account", "trusted_author", "needs_link_context"],
        }),
      ]),
    ).toBe(false);
    expect(
      isFirstPartyOfficialQuality(
        evidence({
          eligibleForTopRead: false,
          flags: ["official_account", "trusted_author"],
        }).contentQuality,
      ),
    ).toBe(false);
  });

  it("builds a stable publication burst only for eligible official evidence", () => {
    expect(
      firstPartyPublicationBurstKey(
        evidence({ flags: ["official_account", "trusted_author"] }),
      ),
    ).toBe("x-twitter:openai:1783598400:generic");
    expect(
      firstPartyPublicationBurstKey(evidence({ flags: [] })),
    ).toBeUndefined();
  });
});

const evidence = (
  quality: Partial<NonNullable<SummaryEvidenceItem["contentQuality"]>>,
): SummaryEvidenceItem => ({
  feedItemId: "feed-openai",
  sourceItemId: "source-openai",
  sourceBindingId: "binding-x",
  interestId: "ai-agents",
  providerKey: "x-twitter",
  authorHandle: "OpenAI",
  canonicalUrl: "https://x.com/OpenAI/status/1",
  title: "OpenAI announces a new model",
  publishedAt: new Date("2026-07-09T12:00:00.000Z"),
  observedAt: new Date("2026-07-09T12:01:00.000Z"),
  score: 2.4,
  whyImportant: ["First-party product announcement"],
  contentQuality: {
    qualityScore: 1,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 1,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Trusted first-party source",
    ...quality,
  },
});
