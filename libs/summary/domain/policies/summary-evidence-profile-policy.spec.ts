import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import { buildSummaryEvidenceProfile } from "./summary-evidence-profile-policy";

describe("buildSummaryEvidenceProfile", () => {
  it("summarizes source coverage, eligibility and confidence warnings", () => {
    const profile = buildSummaryEvidenceProfile(selection());

    expect(profile).toEqual({
      rankingPolicyVersion: "story_ranking_v1",
      selectedEvidenceCount: 3,
      storyClusterCount: 2,
      providerCount: 2,
      providerCounts: [
        { providerKey: "reddit", count: 2 },
        { providerKey: "x-twitter", count: 1 },
      ],
      crossProviderClusterCount: 1,
      topReadEligibleCount: 2,
      downrankedEvidenceCount: 1,
      conversationContextItemCount: 1,
      coverageWarnings: ["downranked_evidence_present"],
    });
  });

  it("flags empty and single-provider selections without provider-specific logic", () => {
    expect(
      buildSummaryEvidenceProfile({
        rankingPolicyVersion: "story_ranking_v1",
        sourceWindow: {
          windowId: "window-empty",
          startedAt: new Date("2026-06-23T08:00:00.000Z"),
          endedAt: new Date("2026-06-23T09:00:00.000Z"),
          selectedFeedItemIds: [],
          storyClusterIds: [],
        },
        clusters: [],
        selectedEvidence: [],
      }).coverageWarnings,
    ).toEqual(["no_evidence", "no_top_read_eligible_evidence"]);
  });
});

const selection = (): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story_ranking_v1",
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-23T08:00:00.000Z"),
    endedAt: new Date("2026-06-23T09:00:00.000Z"),
    selectedFeedItemIds: ["feed-reddit-1", "feed-reddit-2", "feed-x"],
    storyClusterIds: ["story:reddit", "story:cross"],
  },
  clusters: [
    {
      id: "story:reddit",
      storyKey: "url:reddit.test/r/ai/comments/1",
      representativeFeedItemId: "feed-reddit-1",
      duplicateFeedItemIds: ["feed-reddit-2"],
      interestIds: ["interest-ai"],
      providerKeys: ["reddit"],
      score: 2.1,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:10:00.000Z"),
      },
      whyImportant: ["Popular Reddit discussion"],
    },
    {
      id: "story:cross",
      storyKey: "title:codex-cli",
      representativeFeedItemId: "feed-x",
      duplicateFeedItemIds: [],
      interestIds: ["interest-ai"],
      providerKeys: ["x-twitter", "reddit"],
      score: 2.9,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:20:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
      },
      whyImportant: ["Confirmed by multiple providers"],
    },
  ],
  selectedEvidence: [
    evidenceItem({
      feedItemId: "feed-reddit-1",
      providerKey: "reddit",
      contentQuality: {
        qualityScore: 1,
        interestRelevanceScore: 1,
        engagementIntegrityScore: 1,
        eligibleForSummary: true,
        eligibleForTopRead: true,
        needsLlmReview: false,
        decision: "promote",
        flags: [],
        reason: "Useful discussion",
      },
    }),
    evidenceItem({
      feedItemId: "feed-reddit-2",
      providerKey: "reddit",
      contentQuality: {
        qualityScore: 0.6,
        interestRelevanceScore: 0.7,
        engagementIntegrityScore: 0.8,
        eligibleForSummary: true,
        eligibleForTopRead: false,
        needsLlmReview: true,
        decision: "downrank",
        flags: ["weak_interest_match"],
        reason: "Weak interest match",
      },
    }),
    evidenceItem({
      feedItemId: "feed-x",
      providerKey: "x-twitter",
      conversationContext: {
        rankingBasis: "cohort_baseline_v1",
        bundleScore: 1.2,
        units: [],
      },
    }),
  ],
});

const evidenceItem = (
  overrides: Partial<SummaryEvidenceSelection["selectedEvidence"][number]>,
): SummaryEvidenceSelection["selectedEvidence"][number] => ({
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  sourceBindingId: "binding-1",
  interestId: "interest-ai",
  providerKey: "reddit",
  canonicalUrl: "https://example.test/item",
  title: "AI tooling signal",
  publishedAt: new Date("2026-06-23T08:00:00.000Z"),
  observedAt: new Date("2026-06-23T08:05:00.000Z"),
  score: 1.5,
  whyImportant: ["Fresh item"],
  ...overrides,
});
