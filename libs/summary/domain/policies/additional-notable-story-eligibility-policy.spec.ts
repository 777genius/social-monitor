import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { isAdditionalNotableStoryLeadEvidence } from "./additional-notable-story-eligibility-policy";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

describe("additional notable story provider-native eligibility", () => {
  it.each([
    ["x-twitter", "Likes", "25"],
    ["x-twitter", "Reposts", "8"],
    ["reddit", "Score", "20"],
    ["hacker-news", "Points", "20"],
    ["github-repo-radar", "Trend", "+50 / 48h"],
    ["github-trending-page", "Rank", "#10"],
  ])("qualifies %s at the %s floor", (provider, label, value) => {
    expect(
      isAdditionalNotableStoryLeadEvidence(evidence(provider, [
        { label, value },
      ])),
    ).toBe(true);
  });

  it.each([
    ["x-twitter", "Replies", "999999999"],
    ["x-twitter", "Quotes", "999999999"],
    ["x-twitter", "Bookmarks", "999999999"],
    ["x-twitter", "Impressions", "999999999"],
    ["reddit", "Comments", "999999999"],
    ["hacker-news", "Comments", "999999999"],
  ])("never qualifies %s from forbidden %s", (provider, label, value) => {
    expect(isAdditionalNotableStoryLeadEvidence(
      evidence(provider, [{ label, value }]),
    )).toBe(false);
  });

  it.each([
    ["x-twitter", "Likes", "24"],
    ["x-twitter", "Reposts", "7"],
    ["x-twitter", "Replies", "11"],
    ["reddit", "Score", "19"],
    ["reddit", "Comments", "4"],
    ["hacker-news", "Points", "19"],
    ["hacker-news", "Comments", "7"],
    ["github-repo-radar", "Trend", "+49 / 48h"],
    ["github-trending-page", "Rank", "#11"],
  ])("rejects %s below the %s floor", (provider, label, value) => {
    expect(
      isAdditionalNotableStoryLeadEvidence(evidence(provider, [
        { label, value },
      ])),
    ).toBe(false);
  });

  it("accepts official RSS and rejects ordinary RSS", () => {
    expect(isAdditionalNotableStoryLeadEvidence(evidence("rss", [], true))).toBe(
      true,
    );
    expect(isAdditionalNotableStoryLeadEvidence(evidence("rss"))).toBe(false);
  });

  it("keeps metricless discussions support-only", () => {
    for (const provider of ["x-twitter", "reddit", "hacker-news"]) {
      expect(isAdditionalNotableStoryLeadEvidence(evidence(provider))).toBe(
        false,
      );
    }
  });

  it("keeps the exact provider Rank marker local to Additional stories", () => {
    const ranked = evidence("github-trending-page", [
      { label: "Rank", value: "#3" },
    ]);

    expect(isAdditionalNotableStoryLeadEvidence(ranked)).toBe(true);
    expect(isTopReadEligibleEvidence(ranked)).toBe(false);
    expect(isAdditionalNotableStoryLeadEvidence(evidence(
      "github-trending-page",
      [{ label: "Provider rank", value: "#3" }],
    ))).toBe(false);
  });
});

const evidence = (
  providerKey: string,
  providerMetricLabels: SummaryEvidenceItem["providerMetricLabels"] = [],
  official = false,
): SummaryEvidenceItem => ({
  feedItemId: "feed-item",
  sourceItemId: "source-item",
  sourceBindingId: "source-binding",
  interestId: "interest-tools",
  providerKey,
  canonicalUrl: "https://provider.example/story",
  title: "Synthetic story",
  publishedAt: new Date("2026-08-14T10:00:00.000Z"),
  observedAt: new Date("2026-08-14T10:05:00.000Z"),
  score: 1,
  whyImportant: [],
  providerMetricLabels,
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: official ? ["official_account", "trusted_author"] : [],
    reason: "Synthetic quality fixture",
  },
});
