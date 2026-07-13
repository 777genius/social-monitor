import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { isReaderSummaryWatchEligibleEvidence } from "./reader-summary-watch-eligibility-policy";

describe("isReaderSummaryWatchEligibleEvidence", () => {
  it("rejects a weak truncated Hacker News watch", () => {
    expect(
      isReaderSummaryWatchEligibleEvidence({
        evidence: item({
          providerMetricLabels: [
            { label: "Points", value: "3" },
            { label: "Comments", value: "1" },
          ],
          bodyPreview:
            "A short teaser that ends before explaining the claim...",
        }),
        crossProviderSupported: false,
      }),
    ).toBe(false);
  });

  it("keeps a self-contained high-engagement watch", () => {
    expect(
      isReaderSummaryWatchEligibleEvidence({
        evidence: item({
          providerMetricLabels: [
            { label: "Points", value: "30" },
            { label: "Comments", value: "10" },
          ],
        }),
        crossProviderSupported: false,
      }),
    ).toBe(true);
  });

  it("keeps a low-engagement first-party announcement", () => {
    expect(
      isReaderSummaryWatchEligibleEvidence({
        evidence: item({
          contentQuality: {
            ...quality,
            flags: ["official_account", "trusted_author"],
          },
          providerMetricLabels: [
            { label: "Points", value: "2" },
            { label: "Comments", value: "0" },
          ],
        }),
        crossProviderSupported: false,
      }),
    ).toBe(true);
  });

  it("keeps a self-contained cross-provider watch", () => {
    expect(
      isReaderSummaryWatchEligibleEvidence({
        evidence: item({
          providerMetricLabels: [
            { label: "Points", value: "3" },
            { label: "Comments", value: "1" },
          ],
        }),
        crossProviderSupported: true,
      }),
    ).toBe(true);
  });

  it("rejects a single-provider RSS watch without measurable engagement", () => {
    expect(
      isReaderSummaryWatchEligibleEvidence({
        evidence: item({
          providerKey: "rss",
          providerMetricLabels: [],
        }),
        crossProviderSupported: false,
      }),
    ).toBe(false);
  });
});

const quality = {
  qualityScore: 0.8,
  interestRelevanceScore: 0.8,
  engagementIntegrityScore: 0.8,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "eligible",
  flags: [] as readonly string[],
  reason: "Relevant evidence",
};

const item = (
  overrides: Partial<SummaryEvidenceItem> = {},
): SummaryEvidenceItem => ({
  feedItemId: "watch-feed",
  sourceItemId: "watch-source",
  sourceBindingId: "watch-binding",
  interestId: "interest-ai",
  providerKey: "hacker-news",
  canonicalUrl: "https://news.ycombinator.com/item?id=1",
  title: "Developers test a new coding-agent routing workflow",
  bodyPreview:
    "The discussion explains the setup, its trade-offs, and the operational reason teams are testing the workflow now.",
  publishedAt: new Date("2026-07-12T12:00:00.000Z"),
  observedAt: new Date("2026-07-12T12:05:00.000Z"),
  score: 1.8,
  whyImportant: ["The workflow may affect current engineering decisions."],
  contentQuality: quality,
  ...overrides,
});
