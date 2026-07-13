import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { selectUniqueTopReadCandidates } from "./top-read-selection-policy";

describe("top read editorial priority", () => {
  it("prefers independently supported coverage over a viral single-source post", () => {
    const stories = [
      story("ant", "Ant JavaScript ecosystem", ["c-ant-hn", "c-ant-rss"]),
      story("usage", "Agent workflow usage limits", ["c-usage-x"]),
    ];
    const citations = citationMap([
      citation("c-ant-hn", "ant-hn", "hacker-news"),
      citation("c-ant-rss", "ant-rss", "reddit"),
      citation("c-usage-x", "usage-x", "x-twitter"),
    ]);
    const evidence = evidenceMap([
      evidenceItem({
        feedItemId: "ant-hn",
        providerKey: "hacker-news",
        canonicalUrl: "https://news.ycombinator.com/item?id=123",
        sourceOriginUrl: "https://ant.example/",
        score: 2.023,
        metrics: [
          ["Points", "155"],
          ["Comments", "67"],
        ],
        qualityScore: 0.55,
      }),
      evidenceItem({
        feedItemId: "ant-rss",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.example/r/javascript/ant-review",
        score: 1.71,
        metrics: [],
        qualityScore: 0.55,
      }),
      evidenceItem({
        feedItemId: "usage-x",
        providerKey: "x-twitter",
        canonicalUrl: "https://x.com/example/status/123",
        score: 2.505,
        metrics: [
          ["Likes", "7,821"],
          ["Reposts", "410"],
          ["Replies", "1,139"],
        ],
        qualityScore: 0.9,
      }),
    ]);
    const clusters = clusterMap([
      cluster({
        id: "ant",
        representativeFeedItemId: "ant-hn",
        duplicateFeedItemIds: ["ant-rss"],
        providerKeys: ["hacker-news", "reddit"],
        score: 2.65,
        baseScore: 2.023,
      }),
      cluster({
        id: "usage",
        representativeFeedItemId: "usage-x",
        providerKeys: ["x-twitter"],
        score: 2.625,
        baseScore: 2.505,
      }),
    ]);

    const result = selectUniqueTopReadCandidates(
      stories,
      citations,
      evidence,
      clusters,
      2,
    );

    expect(result.map((item) => item.title)).toEqual([
      "Ant JavaScript ecosystem",
      "Agent workflow usage limits",
    ]);
  });

  it("does not let a viral down-ranked duplicate lend its score to a weak eligible lead", () => {
    const stories = [
      story("mixed", "Mixed viral cluster", ["c-viral", "c-eligible"]),
      story("verified", "Verified workflow discussion", ["c-verified"]),
    ];
    const citations = citationMap([
      citation("c-viral", "mixed-viral", "x-twitter"),
      citation("c-eligible", "mixed-eligible", "reddit"),
      citation("c-verified", "verified", "hacker-news"),
    ]);
    const evidence = evidenceMap([
      evidenceItem({
        feedItemId: "mixed-viral",
        providerKey: "x-twitter",
        canonicalUrl: "https://x.com/example/status/viral",
        score: 3.8,
        metrics: [["Likes", "120,000"]],
        qualityScore: 0.35,
        decision: "downrank",
        needsLlmReview: true,
      }),
      evidenceItem({
        feedItemId: "mixed-eligible",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.example/post/mixed",
        score: 1.1,
        metrics: [["Score", "25"]],
        qualityScore: 0.8,
      }),
      evidenceItem({
        feedItemId: "verified",
        providerKey: "hacker-news",
        canonicalUrl: "https://news.ycombinator.com/item?id=verified",
        score: 2.2,
        metrics: [
          ["Points", "420"],
          ["Comments", "96"],
        ],
        qualityScore: 0.9,
      }),
    ]);
    const clusters = clusterMap([
      cluster({
        id: "mixed",
        representativeFeedItemId: "mixed-viral",
        duplicateFeedItemIds: ["mixed-eligible"],
        providerKeys: ["x-twitter", "reddit"],
        score: 4.4,
        baseScore: 3.8,
      }),
      cluster({
        id: "verified",
        representativeFeedItemId: "verified",
        providerKeys: ["hacker-news"],
        score: 2.32,
        baseScore: 2.2,
      }),
    ]);

    const result = selectUniqueTopReadCandidates(
      stories,
      citations,
      evidence,
      clusters,
      2,
    );

    expect(result[0]?.title).toBe("Verified workflow discussion");
  });
});

const story = (
  id: string,
  title: string,
  citationIds: readonly string[],
): TopReadCandidate => ({
  storyClusterId: `story:${id}`,
  title,
  summary: `${title} matters to AI developer workflows.`,
  interestIds: ["ai-developer-tools"],
  providerKeys: [],
  citationIds,
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

const evidenceItem = (params: {
  readonly feedItemId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly sourceOriginUrl?: string;
  readonly score: number;
  readonly metrics: readonly (readonly [string, string])[];
  readonly qualityScore: number;
  readonly decision?: string;
  readonly needsLlmReview?: boolean;
}): SummaryEvidenceItem => ({
  feedItemId: params.feedItemId,
  sourceItemId: `source-${params.feedItemId}`,
  sourceBindingId: `binding-${params.providerKey}`,
  interestId: "ai-developer-tools",
  providerKey: params.providerKey,
  providerName: params.providerKey,
  canonicalUrl: params.canonicalUrl,
  sourceOriginUrl: params.sourceOriginUrl,
  title: params.feedItemId,
  publishedAt: new Date("2026-07-11T12:00:00.000Z"),
  observedAt: new Date("2026-07-11T12:05:00.000Z"),
  score: params.score,
  whyImportant: ["Relevant to monitored agent workflows"],
  providerMetricLabels: params.metrics.map(([label, value]) => ({
    label,
    value,
  })),
  contentQuality: {
    qualityScore: params.qualityScore,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: params.needsLlmReview ?? false,
    decision: params.decision ?? "eligible",
    flags: [],
    reason: "Relevant test evidence",
  },
});

const cluster = (params: {
  readonly id: string;
  readonly representativeFeedItemId: string;
  readonly duplicateFeedItemIds?: readonly string[];
  readonly providerKeys: readonly string[];
  readonly score: number;
  readonly baseScore: number;
}): StoryCluster => ({
  id: `story:${params.id}`,
  storyKey: params.id,
  representativeFeedItemId: params.representativeFeedItemId,
  duplicateFeedItemIds: params.duplicateFeedItemIds ?? [],
  interestIds: ["ai-developer-tools"],
  providerKeys: params.providerKeys,
  score: params.score,
  signalBreakdown: {
    baseScore: params.baseScore,
    crossProviderSupport: Math.max(0, params.score - params.baseScore),
    sameProviderSupport: 0,
    providerDiversityBoost: 0,
    interestDiversityBoost: 0,
    freshnessBoost: 0,
    totalScore: params.score,
  },
  observedAtRange: {
    startedAt: new Date("2026-07-11T12:00:00.000Z"),
    endedAt: new Date("2026-07-11T13:00:00.000Z"),
  },
  whyImportant: ["Relevant to monitored agent workflows"],
});

const citationMap = (
  values: readonly ReaderSummaryCitation[],
): ReadonlyMap<string, ReaderSummaryCitation> =>
  new Map(values.map((item) => [item.citationId, item] as const));

const evidenceMap = (
  values: readonly SummaryEvidenceItem[],
): ReadonlyMap<string, SummaryEvidenceItem> =>
  new Map(values.map((item) => [item.feedItemId, item] as const));

const clusterMap = (
  values: readonly StoryCluster[],
): ReadonlyMap<string, StoryCluster> =>
  new Map(values.map((item) => [item.id, item] as const));
