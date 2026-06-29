import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import { selectUniqueTopReadCandidates } from "./top-read-selection-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

describe("selectUniqueTopReadCandidates", () => {
  it("keeps low-engagement X and Hacker News evidence out of reader top reads", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("weak-x", "Weak X chatter", "c-weak-x", ["x-twitter"]),
        story("strong-x", "Strong X rollout", "c-strong-x", ["x-twitter"]),
        story("weak-hn", "Weak HN discussion", "c-weak-hn", ["hacker-news"]),
      ],
      citations([
        citation("c-weak-x", "feed-weak-x", "x-twitter"),
        citation("c-strong-x", "feed-strong-x", "x-twitter"),
        citation("c-weak-hn", "feed-weak-hn", "hacker-news"),
      ]),
      evidence([
        evidenceItem("feed-weak-x", "x-twitter", [
          ["Likes", "1"],
          ["Reposts", "0"],
          ["Replies", "1"],
        ]),
        evidenceItem("feed-strong-x", "x-twitter", [
          ["Likes", "480"],
          ["Reposts", "92"],
          ["Replies", "44"],
        ]),
        evidenceItem("feed-weak-hn", "hacker-news", [
          ["Points", "3"],
          ["Comments", "0"],
        ]),
      ]),
      clusters(["weak-x", "strong-x", "weak-hn"]),
    );

    expect(result.map((item) => item.title)).toEqual(["Strong X rollout"]);
  });

  it("uses the strong citation from a mixed story instead of letting weak evidence lead", () => {
    const result = selectUniqueTopReadCandidates(
      [
        {
          ...story("mixed", "Agent tooling is moving", "c-weak-hn", [
            "hacker-news",
            "github-trending-page",
          ]),
          citationIds: ["c-weak-hn", "c-strong-gh"],
        },
      ],
      citations([
        citation("c-weak-hn", "feed-weak-hn", "hacker-news"),
        citation("c-strong-gh", "feed-strong-gh", "github-trending-page"),
      ]),
      evidence([
        evidenceItem("feed-weak-hn", "hacker-news", [
          ["Points", "1"],
          ["Comments", "0"],
        ]),
        evidenceItem("feed-strong-gh", "github-trending-page", [
          ["GitHub Trending daily", "#3, +266 stars today"],
          ["Stars", "62,183"],
        ]),
      ]),
      clusters(["mixed"]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.citationIds).toEqual(["c-strong-gh"]);
  });
});

const story = (
  id: string,
  title: string,
  citationId: string,
  providerKeys: readonly string[],
): TopReadCandidate => ({
  storyClusterId: `story:${id}`,
  title,
  summary: `${title} is worth reading.`,
  topicIds: ["ai-developer-tools"],
  providerKeys,
  citationIds: [citationId],
});

const citation = (
  citationId: string,
  feedItemId: string,
  providerKey: string,
): ReaderSummaryCitation => ({
  citationId,
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});

const citations = (
  values: readonly ReaderSummaryCitation[],
): ReadonlyMap<string, ReaderSummaryCitation> =>
  new Map(values.map((item) => [item.citationId, item] as const));

const evidence = (
  values: readonly SummaryEvidenceItem[],
): ReadonlyMap<string, SummaryEvidenceItem> =>
  new Map(values.map((item) => [item.feedItemId, item] as const));

const clusters = (ids: readonly string[]): ReadonlyMap<string, StoryCluster> =>
  new Map(
    ids.map((id) => {
      const cluster = {
        id: `story:${id}`,
        storyKey: `story-key:${id}`,
        representativeFeedItemId: `feed-${id}`,
        duplicateFeedItemIds: [],
        topicIds: ["ai-developer-tools"],
        providerKeys: ["x-twitter"],
        score: 2.4,
        observedAtRange: {
          startedAt: new Date("2026-06-29T00:00:00.000Z"),
          endedAt: new Date("2026-06-29T01:00:00.000Z"),
        },
        whyImportant: [`Story ${id} is active.`],
      } satisfies StoryCluster;

      return [cluster.id, cluster] as const;
    }),
  );

const evidenceItem = (
  feedItemId: string,
  providerKey: string,
  metrics: readonly (readonly [string, string])[],
): SummaryEvidenceItem => ({
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  sourceBindingId: `binding-${providerKey}`,
  topicId: "ai-developer-tools",
  providerKey,
  providerName: providerKey,
  canonicalUrl: `https://example.test/${feedItemId}`,
  title: feedItemId,
  publishedAt: new Date("2026-06-29T00:00:00.000Z"),
  observedAt: new Date("2026-06-29T00:05:00.000Z"),
  score: 2.4,
  whyImportant: ["Strong source engagement signal"],
  providerMetricLabels: metrics.map(([label, value]) => ({ label, value })),
  contentQuality: {
    qualityScore: 0.9,
    topicRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Test quality signal",
  },
});
