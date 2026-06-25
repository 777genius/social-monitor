import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";

import {
  STORY_RANKING_POLICY_V1,
  type SummaryEvidenceSelection,
} from "../../domain";
import { StoryRankingMetricsRecorder } from "./story-ranking-metrics.recorder";

describe("StoryRankingMetricsRecorder", () => {
  it("records production ranking and dedup gauges with the policy version label", () => {
    const metrics = new InMemoryMetricsRecorder();
    const recorder = new StoryRankingMetricsRecorder(metrics);

    recorder.recordStoryRanking(selection());

    const labels = { ranking_policy_version: STORY_RANKING_POLICY_V1.version };
    expect(
      metrics.latestGaugeValue("summary_story_ranking_average_signal", labels),
    ).toBe(2.4);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_cross_provider_cluster_share",
        labels,
      ),
    ).toBe(0.5);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_title_only_cluster_share",
        labels,
      ),
    ).toBe(0.5);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_same_provider_duplicates_total",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_same_provider_duplicate_max",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_clusters_without_provider_metrics",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_top_provider_cluster_share",
        {
          ...labels,
          top_provider_key: "github-repo-radar",
        },
      ),
    ).toBe(0.5);
  });
});

const selection = (): SummaryEvidenceSelection => ({
  rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-23T08:00:00.000Z"),
    endedAt: new Date("2026-06-23T09:00:00.000Z"),
    selectedFeedItemIds: ["feed-reddit-1", "feed-reddit-2", "feed-github"],
    storyClusterIds: ["story:title-only", "story:cross-provider"],
  },
  clusters: [
    {
      id: "story:title-only",
      storyKey: "title:browser-agent-rumor",
      rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
      representativeFeedItemId: "feed-reddit-1",
      duplicateFeedItemIds: ["feed-reddit-2"],
      topicIds: ["topic-ai"],
      providerKeys: ["reddit"],
      score: 2,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
      },
      whyImportant: ["Clustered 2 related source items"],
    },
    {
      id: "story:cross-provider",
      storyKey: "github-repo:openai/codex",
      rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
      representativeFeedItemId: "feed-github",
      duplicateFeedItemIds: [],
      topicIds: ["topic-ai"],
      providerKeys: ["github-repo-radar", "hacker-news"],
      score: 2.8,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:10:00.000Z"),
        endedAt: new Date("2026-06-23T08:40:00.000Z"),
      },
      whyImportant: ["Confirmed by 2 providers"],
    },
  ],
  selectedEvidence: [
    {
      feedItemId: "feed-reddit-1",
      sourceItemId: "reddit-1",
      sourceBindingId: "binding-reddit",
      topicId: "topic-ai",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/programming/comments/abc",
      title: "Browser agent rumor",
      publishedAt: new Date("2026-06-23T07:00:00.000Z"),
      observedAt: new Date("2026-06-23T08:00:00.000Z"),
      score: 2,
      whyImportant: ["Popular Reddit thread"],
    },
    {
      feedItemId: "feed-reddit-2",
      sourceItemId: "reddit-2",
      sourceBindingId: "binding-reddit",
      topicId: "topic-ai",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/programming/comments/abc?sort=top",
      title: "Browser agent rumor duplicate",
      publishedAt: new Date("2026-06-23T07:05:00.000Z"),
      observedAt: new Date("2026-06-23T08:05:00.000Z"),
      score: 1.9,
      whyImportant: ["Duplicate Reddit thread"],
    },
    {
      feedItemId: "feed-github",
      sourceItemId: "github-1",
      sourceBindingId: "binding-github",
      topicId: "topic-ai",
      providerKey: "github-repo-radar",
      canonicalUrl: "https://github.com/openai/codex",
      title: "openai/codex",
      publishedAt: new Date("2026-06-23T07:10:00.000Z"),
      observedAt: new Date("2026-06-23T08:10:00.000Z"),
      score: 2.8,
      whyImportant: ["Repository is gaining stars"],
      providerMetricLabels: [{ label: "Stars", value: "54,000" }],
      providerMetricSummary: "54,000 total stars",
    },
  ],
});
