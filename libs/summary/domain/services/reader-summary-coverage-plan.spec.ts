import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { buildReaderSummaryCoveragePlan } from "./reader-summary-coverage-plan";

describe("buildReaderSummaryCoveragePlan", () => {
  it("selects one lead and diverse strong secondary signals", () => {
    const selection = buildSelection([
      cluster("openai", 4.2, "openai-a", ["x-twitter", "rss"]),
      cluster("openai-copy", 3.8, "openai-b", ["reddit"]),
      cluster("security", 2.1, "security-a", ["hacker-news"]),
      cluster("database", 1.7, "database-a", ["rss"]),
    ]);

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.lead?.clusterId).toBe("openai");
    expect(plan.secondary.map((item) => item.clusterId)).toEqual([
      "security",
      "database",
    ]);
  });

  it("does not fill secondary slots with weak clusters", () => {
    const selection = buildSelection([
      cluster("lead", 3.4, "lead-a", ["reddit"]),
      cluster("weak", 0.4, "weak-a", ["rss"]),
    ]);

    expect(buildReaderSummaryCoveragePlan(selection).secondary).toEqual([]);
  });

  it("does not force a down-ranked item into the headline when no lead is eligible", () => {
    const base = buildSelection([
      cluster("unverified", 3.8, "unverified-a", ["x-twitter"]),
    ]);
    const item = evidenceById(base, "unverified-a");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...item,
          contentQuality: {
            ...item.contentQuality!,
            decision: "downrank",
            needsLlmReview: true,
            reason: "Unverified viral claim",
          },
        },
      ],
    };

    expect(buildReaderSummaryCoveragePlan(selection)).toEqual({
      secondary: [],
    });
  });

  it("keeps GitHub-only clusters out when social or news coverage exists", () => {
    const selection = buildSelection([
      cluster("github-trend", 8.4, "github-a", ["github-trending-page"]),
      cluster("social-lead", 3.4, "social-a", ["reddit", "rss"]),
      cluster("news-secondary", 1.8, "news-a", ["hacker-news"]),
    ]);

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.lead?.clusterId).toBe("social-lead");
    expect(plan.secondary.map((item) => item.clusterId)).toEqual([
      "news-secondary",
    ]);
  });

  it("prefers a highly engaged relevant discussion over a marginally higher down-ranked launch", () => {
    const antCluster = {
      ...cluster("ant", 2.65, "ant-hn", ["hacker-news", "rss"]),
      duplicateFeedItemIds: ["ant-rss"],
      signalBreakdown: {
        baseScore: 2.023,
        crossProviderSupport: 0.257,
        sameProviderSupport: 0,
        providerDiversityBoost: 0.25,
        interestDiversityBoost: 0,
        freshnessBoost: 0.12,
        totalScore: 2.65,
      },
    } satisfies StoryCluster;
    const usageCluster = {
      ...cluster("usage-limits", 2.625, "usage-x", ["x-twitter"]),
      signalBreakdown: {
        baseScore: 2.505,
        crossProviderSupport: 0,
        sameProviderSupport: 0,
        providerDiversityBoost: 0,
        interestDiversityBoost: 0,
        freshnessBoost: 0.12,
        totalScore: 2.625,
      },
    } satisfies StoryCluster;
    const base = buildSelection([antCluster, usageCluster]);
    const antHn = evidenceById(base, "ant-hn");
    const usageX = evidenceById(base, "usage-x");
    const selection: SummaryEvidenceSelection = {
      ...base,
      selectedEvidence: [
        {
          ...antHn,
          title: "Show HN: Ant JavaScript ecosystem",
          canonicalUrl: "https://news.ycombinator.com/item?id=123",
          sourceOriginUrl: "https://ant.example/",
          providerMetricLabels: [
            { label: "Points", value: "155" },
            { label: "Comments", value: "67" },
          ],
          contentQuality: {
            ...antHn.contentQuality!,
            qualityScore: 0.55,
            decision: "downrank",
            flags: ["missing_topic_context"],
            reason: "Early launch lacks broader topic context",
          },
        },
        {
          ...antHn,
          feedItemId: "ant-rss",
          sourceItemId: "ant-rss",
          providerKey: "rss",
          canonicalUrl: "https://ant.example/",
          score: 1.71,
          providerMetricLabels: [],
          contentQuality: {
            ...antHn.contentQuality!,
            qualityScore: 0.55,
            decision: "downrank",
            flags: ["missing_topic_context"],
            reason: "Same early launch publication",
          },
        },
        {
          ...usageX,
          title: "Agent-heavy usage is stressing product limits",
          providerMetricLabels: [
            { label: "Likes", value: "7,821" },
            { label: "Reposts", value: "410" },
            { label: "Replies", value: "1,139" },
          ],
          contentQuality: {
            ...usageX.contentQuality!,
            qualityScore: 0.9,
            interestRelevanceScore: 0.95,
          },
        },
      ],
    };

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.lead?.clusterId).toBe("usage-limits");
    expect(plan.secondary.map((item) => item.clusterId)).toContain("ant");
  });

  it("prefers an independent secondary topic inside the quality threshold", () => {
    const selection = buildSelection([
      cluster("lead", 4, "openai-a", ["reddit"]),
      cluster("same-provider", 3, "openai-cost", ["reddit"]),
      cluster("independent", 2.9, "security-a", ["hacker-news"]),
    ]);

    const plan = buildReaderSummaryCoveragePlan(selection);

    expect(plan.secondary[0]?.clusterId).toBe("independent");
  });
});

const buildSelection = (
  clusters: readonly StoryCluster[],
): SummaryEvidenceSelection => {
  const selectedEvidence = clusters.map((item): SummaryEvidenceItem => ({
    feedItemId: item.representativeFeedItemId,
    sourceItemId: item.representativeFeedItemId,
    sourceBindingId: `binding-${item.representativeFeedItemId}`,
    interestId: item.id,
    providerKey: item.providerKeys[0] ?? "rss",
    canonicalUrl: `https://example.test/${item.representativeFeedItemId}`,
    title: titleFor(item.representativeFeedItemId),
    bodyPreview: `${titleFor(item.representativeFeedItemId)} detailed context`,
    publishedAt: new Date("2026-07-09T12:00:00.000Z"),
    observedAt: new Date("2026-07-09T12:05:00.000Z"),
    score: item.score,
    whyImportant: ["Relevant today"],
    contentQuality: {
      qualityScore: 0.8,
      interestRelevanceScore: 0.8,
      engagementIntegrityScore: 0.8,
      eligibleForSummary: true,
      eligibleForTopRead: true,
      needsLlmReview: false,
      decision: "eligible",
      flags: [],
      reason: "Strong signal",
    },
  }));

  return {
    rankingPolicyVersion: "test-v1",
    sourceWindow: {
      windowId: "window",
      startedAt: new Date("2026-07-09T00:00:00.000Z"),
      endedAt: new Date("2026-07-10T00:00:00.000Z"),
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((item) => item.id),
    },
    clusters,
    selectedEvidence,
  };
};

const cluster = (
  id: string,
  score: number,
  representativeFeedItemId: string,
  providerKeys: readonly string[],
): StoryCluster => ({
  id,
  storyKey: id,
  representativeFeedItemId,
  duplicateFeedItemIds: [],
  interestIds: [id],
  providerKeys,
  score,
  observedAtRange: {
    startedAt: new Date("2026-07-09T12:00:00.000Z"),
    endedAt: new Date("2026-07-09T12:10:00.000Z"),
  },
  whyImportant: ["Relevant today"],
});

const titleFor = (feedItemId: string): string => {
  if (feedItemId.startsWith("openai")) {
    if (feedItemId === "openai-cost") {
      return "OpenAI users debate pricing and usage limits";
    }
    return "OpenAI GPT rollout changes coding workflows";
  }
  if (feedItemId.startsWith("security")) {
    return "Security researchers publish browser isolation framework";
  }
  if (feedItemId.startsWith("database")) {
    return "PostgreSQL teams test query planning extension";
  }
  if (feedItemId.startsWith("social")) {
    return "OpenAI developers discuss agent workflow changes";
  }
  if (feedItemId.startsWith("news")) {
    return "Security teams publish a new browser isolation policy";
  }
  if (feedItemId.startsWith("github")) {
    return "GitHub project gains stars for a terminal theme";
  }
  return "Small unrelated discussion";
};

const evidenceById = (
  selection: SummaryEvidenceSelection,
  feedItemId: string,
): SummaryEvidenceItem => {
  const item = selection.selectedEvidence.find(
    (candidate) => candidate.feedItemId === feedItemId,
  );
  if (item === undefined) {
    throw new Error(`Missing test evidence ${feedItemId}`);
  }

  return item;
};
