import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  selectUniqueTopReadCandidatePool,
  selectUniqueTopReadCandidates,
} from "./top-read-selection-policy";

describe("selectUniqueTopReadCandidates provider diversity", () => {
  it("caps one dominant provider when enough other providers have eligible reads", () => {
    const xStories = Array.from({ length: 7 }, (_, index) =>
      story(
        `x-${index + 1}`,
        `Claude X signal ${index + 1}`,
        `c-x-${index + 1}`,
        ["x-twitter"],
      ),
    );
    const otherStories = [
      story("reddit-1", "Claude Reddit signal 1", "c-reddit-1", ["reddit"]),
      story("reddit-2", "Claude Reddit signal 2", "c-reddit-2", ["reddit"]),
      story("hn-1", "Claude HN signal 1", "c-hn-1", ["hacker-news"]),
      story("hn-2", "Claude HN signal 2", "c-hn-2", ["hacker-news"]),
      story("rss-1", "Claude RSS signal 1", "c-rss-1", ["rss"]),
      story("rss-2", "Claude RSS signal 2", "c-rss-2", ["rss"]),
    ];
    const allStories = [...xStories, ...otherStories];
    const renderedProviderByStoryId = new Map<string, string>();
    const result = selectUniqueTopReadCandidates(
      allStories,
      citations(
        allStories.map((item) =>
          citation(
            item.citationIds[0] ?? "",
            feedItemId(item),
            renderedProviderKey(item, renderedProviderByStoryId),
          ),
        ),
      ),
      evidence(
        allStories.map((item, index) =>
          evidenceItem(
            feedItemId(item),
            renderedProviderKey(item, renderedProviderByStoryId),
            index,
          ),
        ),
      ),
      new Map(
        allStories.map((item, index) =>
          cluster(item, item.providerKeys[0] ?? "", 2.3 - index * 0.005),
        ),
      ),
      10,
    );

    expect(result).toHaveLength(10);
    expect(providerCounts(result)["x-twitter"]).toBeLessThanOrEqual(4);
    expect(providerCounts(result)).toEqual({
      "x-twitter": 4,
      reddit: 2,
      "hacker-news": 2,
      rss: 2,
    });
  });

  it("caps the rendered provider when a cross-source story starts with another provider key", () => {
    const xStories = Array.from({ length: 5 }, (_, index) =>
      story(
        `x-cross-${index + 1}`,
        `Claude rendered X signal ${index + 1}`,
        `c-x-cross-${index + 1}`,
        ["rss", "x-twitter"],
      ),
    );
    const otherStories = [
      story("reddit-1", "Claude Reddit signal 1", "c-reddit-1", ["reddit"]),
      story("reddit-2", "Claude Reddit signal 2", "c-reddit-2", ["reddit"]),
      story("hn-1", "Claude HN signal 1", "c-hn-1", ["hacker-news"]),
      story("hn-2", "Claude HN signal 2", "c-hn-2", ["hacker-news"]),
      story("rss-1", "Claude RSS signal 1", "c-rss-1", ["rss"]),
      story("rss-2", "Claude RSS signal 2", "c-rss-2", ["rss"]),
    ];
    const allStories = [...xStories, ...otherStories];
    const renderedProviderByStoryId = new Map(
      xStories.map((item) => [item.storyClusterId, "x-twitter"] as const),
    );
    const result = selectUniqueTopReadCandidates(
      allStories,
      citations(
        allStories.map((item) =>
          citation(
            item.citationIds[0] ?? "",
            feedItemId(item),
            renderedProviderKey(item, renderedProviderByStoryId),
          ),
        ),
      ),
      evidence(
        allStories.map((item, index) =>
          evidenceItem(
            feedItemId(item),
            renderedProviderKey(item, renderedProviderByStoryId),
            index,
          ),
        ),
      ),
      new Map(
        allStories.map((item, index) =>
          cluster(
            item,
            renderedProviderKey(item, renderedProviderByStoryId),
            2.3 - index * 0.005,
          ),
        ),
      ),
      10,
    );

    expect(providerCounts(result, renderedProviderByStoryId)).toEqual({
      "x-twitter": 4,
      reddit: 2,
      "hacker-news": 2,
      rss: 2,
    });
  });

  it("does not overfill with a dominant provider when strict cap leaves fewer than ten reads", () => {
    const xStories = Array.from({ length: 6 }, (_, index) =>
      story(
        `x-${index + 1}`,
        `Claude X signal ${index + 1}`,
        `c-x-${index + 1}`,
        ["x-twitter"],
      ),
    );
    const otherStories = [
      story("reddit-1", "Claude Reddit signal 1", "c-reddit-1", ["reddit"]),
      story("reddit-2", "Claude Reddit signal 2", "c-reddit-2", ["reddit"]),
      story("hn-1", "Claude HN signal 1", "c-hn-1", ["hacker-news"]),
      story("hn-2", "Claude HN signal 2", "c-hn-2", ["hacker-news"]),
      story("rss-1", "Claude RSS signal 1", "c-rss-1", ["rss"]),
    ];
    const allStories = [...xStories, ...otherStories];
    const renderedProviderByStoryId = new Map<string, string>();
    const result = selectUniqueTopReadCandidates(
      allStories,
      citations(
        allStories.map((item) =>
          citation(
            item.citationIds[0] ?? "",
            feedItemId(item),
            renderedProviderKey(item, renderedProviderByStoryId),
          ),
        ),
      ),
      evidence(
        allStories.map((item, index) =>
          evidenceItem(
            feedItemId(item),
            renderedProviderKey(item, renderedProviderByStoryId),
            index,
          ),
        ),
      ),
      new Map(
        allStories.map((item, index) =>
          cluster(item, item.providerKeys[0] ?? "", 2.3 - index * 0.005),
        ),
      ),
      10,
    );

    expect(result).toHaveLength(9);
    expect(providerCounts(result)).toEqual({
      "x-twitter": 4,
      reddit: 2,
      "hacker-news": 2,
      rss: 1,
    });
  });

  it("keeps HN and RSS candidates in a dominant-provider supplement pool", () => {
    const xStories = Array.from({ length: 42 }, (_, index) =>
      story(
        `x-pool-${index + 1}`,
        `Claude X pool signal ${index + 1}`,
        `c-x-pool-${index + 1}`,
        ["x-twitter"],
      ),
    );
    const secondaryStories = [
      story("hn-pool-1", "Claude HN pool signal", "c-hn-pool-1", [
        "hacker-news",
      ]),
      story("rss-pool-1", "Claude RSS pool signal", "c-rss-pool-1", ["rss"]),
    ];
    const allStories = [...xStories, ...secondaryStories];
    const pool = selectUniqueTopReadCandidatePool(
      xStories.slice(0, 10),
      citations(
        allStories.map((item) =>
          citation(
            item.citationIds[0] ?? "",
            feedItemId(item),
            item.providerKeys[0] ?? "unknown",
          ),
        ),
      ),
      evidence(
        allStories.map((item, index) =>
          evidenceItem(
            feedItemId(item),
            item.providerKeys[0] ?? "unknown",
            index,
          ),
        ),
      ),
      new Map(
        allStories.map((item, index) =>
          cluster(item, item.providerKeys[0] ?? "unknown", 2.4 - index * 0.005),
        ),
      ),
      10,
    );

    expect(providerCounts(pool)["hacker-news"]).toBe(1);
    expect(providerCounts(pool).rss).toBe(1);
  });

  it("reserves evidence fallback capacity beyond a full authored story pool", () => {
    const authoredStories = Array.from({ length: 32 }, (_, index) =>
      story(
        `x-authored-${index + 1}`,
        `Claude authored X signal ${index + 1}`,
        `c-x-authored-${index + 1}`,
        ["x-twitter"],
      ),
    );
    const fallbackStory = story(
      "x-fallback",
      "Claude evidence-only fallback",
      "c-x-fallback",
      ["x-twitter"],
    );
    const allStories = [...authoredStories, fallbackStory];
    const pool = selectUniqueTopReadCandidatePool(
      authoredStories,
      citations(
        allStories.map((item) =>
          citation(
            item.citationIds[0] ?? "",
            feedItemId(item),
            item.providerKeys[0] ?? "unknown",
          ),
        ),
      ),
      evidence(
        allStories.map((item, index) =>
          evidenceItem(
            feedItemId(item),
            item.providerKeys[0] ?? "unknown",
            index,
          ),
        ),
      ),
      new Map(
        allStories.map((item, index) =>
          cluster(item, item.providerKeys[0] ?? "unknown", 2.4 - index * 0.005),
        ),
      ),
      8,
    );

    expect(pool.map((item) => item.storyClusterId)).toContain(
      fallbackStory.storyClusterId,
    );
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
  interestIds: ["ai-developer-tools"],
  providerKeys,
  citationIds: [citationId],
});

const feedItemId = (item: TopReadCandidate): string =>
  item.storyClusterId.replace("story:", "feed-");

const citation = (
  citationId: string,
  feedItemIdValue: string,
  providerKey: string,
): ReaderSummaryCitation => ({
  citationId,
  feedItemId: feedItemIdValue,
  sourceItemId: `source-${feedItemIdValue}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemIdValue}`,
});

const citations = (
  values: readonly ReaderSummaryCitation[],
): ReadonlyMap<string, ReaderSummaryCitation> =>
  new Map(values.map((item) => [item.citationId, item] as const));

const evidence = (
  values: readonly SummaryEvidenceItem[],
): ReadonlyMap<string, SummaryEvidenceItem> =>
  new Map(values.map((item) => [item.feedItemId, item] as const));

const cluster = (
  item: TopReadCandidate,
  providerKey: string,
  score: number,
): readonly [string, StoryCluster] => [
  item.storyClusterId,
  {
    id: item.storyClusterId,
    storyKey: `story-key:${item.storyClusterId}`,
    representativeFeedItemId: feedItemId(item),
    duplicateFeedItemIds: [],
    interestIds: ["ai-developer-tools"],
    providerKeys: [providerKey],
    score,
    observedAtRange: {
      startedAt: new Date("2026-07-07T00:00:00.000Z"),
      endedAt: new Date("2026-07-07T01:00:00.000Z"),
    },
    whyImportant: [`${item.title} is active.`],
  },
];

const evidenceItem = (
  feedItemIdValue: string,
  providerKey: string,
  index: number,
): SummaryEvidenceItem => ({
  feedItemId: feedItemIdValue,
  sourceItemId: `source-${feedItemIdValue}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "ai-developer-tools",
  providerKey,
  providerName: providerKey,
  canonicalUrl: `https://example.test/${feedItemIdValue}`,
  title: feedItemIdValue,
  publishedAt: new Date("2026-07-07T00:00:00.000Z"),
  observedAt: new Date("2026-07-07T00:05:00.000Z"),
  score: 2.3 - index * 0.005,
  whyImportant: ["Strong source engagement signal"],
  providerMetricLabels: providerMetrics(providerKey, index),
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Test quality signal",
  },
});

const providerCounts = (
  items: readonly TopReadCandidate[],
  renderedProviderByStoryId: ReadonlyMap<string, string> = new Map(),
): Record<string, number> =>
  items.reduce<Record<string, number>>((counts, item) => {
    const providerKey = renderedProviderKey(item, renderedProviderByStoryId);
    counts[providerKey] = (counts[providerKey] ?? 0) + 1;
    return counts;
  }, {});

const renderedProviderKey = (
  item: TopReadCandidate,
  renderedProviderByStoryId: ReadonlyMap<string, string>,
): string =>
  renderedProviderByStoryId.get(item.storyClusterId) ??
  item.providerKeys[0] ??
  "unknown";

const providerMetrics = (
  providerKey: string,
  index: number,
): SummaryEvidenceItem["providerMetricLabels"] => {
  if (providerKey === "reddit") {
    return [
      { label: "Score", value: `${900 - index * 20}` },
      { label: "Comments", value: "80" },
    ];
  }
  if (providerKey === "hacker-news") {
    return [
      { label: "Points", value: `${8_000 - index * 20}` },
    ];
  }
  if (providerKey === "x-twitter") {
    return [
      { label: "Likes", value: `${10_000 - index * 100}` },
      { label: "Reposts", value: "500" },
    ];
  }

  return [];
};
