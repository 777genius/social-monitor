import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { FeedItem } from "../entities/feed-item";
import { feedSignalBaselineSampleFromItem } from "../value-objects/feed-signal-baseline-sample";
import { CohortBaselineFeedSignalNormalizer } from "./cohort-baseline-feed-signal-normalizer";

const now = new Date("2026-06-23T12:00:00.000Z");

describe("CohortBaselineFeedSignalNormalizer", () => {
  it("normalizes Reddit posts against their community cohort instead of global raw score", () => {
    const items = [
      ...redditCohort("tiny-saas", [4, 8, 12, 22, 40]),
      redditItem("tiny-saas-target", "tiny-saas", 55, 18),
      ...redditCohort("programming", [320, 420, 550, 850, 2500]),
      redditItem("programming-target", "programming", 550, 75),
    ];
    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items,
      now,
    });

    const tinySignal = signals.get("tiny-saas-target");
    const programmingSignal = signals.get("programming-target");

    expect(tinySignal?.feedItemId).toBe("tiny-saas-target");
    expect(tinySignal?.providerMetrics).toEqual(
      expect.objectContaining({
        kind: "reddit_post",
        score: 55,
        comments: 18,
        sourceKey: "r/tiny-saas",
      }),
    );
    expect(programmingSignal?.providerMetrics).toEqual(
      expect.objectContaining({
        kind: "reddit_post",
        score: 550,
        sourceKey: "r/programming",
      }),
    );
    expect(tinySignal?.normalizedSignal.score).toBeGreaterThan(
      programmingSignal?.normalizedSignal.score ?? 100,
    );
    expect(tinySignal?.normalizedSignal.cohort.fallback).toBe("exact");
    expect(tinySignal?.normalizedSignal.cohort.baselineWindow).toBe("24h");
    expect(tinySignal?.normalizedSignal.cohort.sampleSize).toBe(6);
  });

  it("uses historical rolling source cohorts without returning baseline-only items", () => {
    const target = redditItem("target", "niche-builders", 90, 18);
    const history = [
      redditItem("history-1", "niche-builders", 12, 2, {
        publishedAt: new Date("2026-06-21T09:00:00.000Z"),
        observedAt: new Date("2026-06-21T09:15:00.000Z"),
      }),
      redditItem("history-2", "niche-builders", 18, 3, {
        publishedAt: new Date("2026-06-21T10:00:00.000Z"),
        observedAt: new Date("2026-06-21T10:15:00.000Z"),
      }),
      redditItem("history-3", "niche-builders", 24, 5, {
        publishedAt: new Date("2026-06-22T10:00:00.000Z"),
        observedAt: new Date("2026-06-22T10:15:00.000Z"),
      }),
      redditItem("history-4", "niche-builders", 30, 6, {
        publishedAt: new Date("2026-06-22T11:00:00.000Z"),
        observedAt: new Date("2026-06-22T11:15:00.000Z"),
      }),
    ];

    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [target],
      baselineSamples: history.flatMap((item) => {
        const sample = feedSignalBaselineSampleFromItem(item);

        return sample === undefined ? [] : [sample];
      }),
      now,
    });

    expect([...signals.keys()]).toEqual(["target"]);
    expect(signals.get("target")?.normalizedSignal.cohort).toEqual(
      expect.objectContaining({
        fallback: "source",
        baselineWindow: "7d",
        sampleSize: 5,
      }),
    );
  });

  it("keeps same-source cohorts scoped to each topic when normalizing an all-topics feed", () => {
    const target = redditItem("all-topics-target", "niche-builders", 90, 18, {
      topicId: "topic-1",
    });
    const sameTopicHistory = [12, 18, 24, 30].map((score, index) =>
      redditItem(`same-topic-history-${index}`, "niche-builders", score, 4, {
        topicId: "topic-1",
        publishedAt: new Date(`2026-06-22T10:0${index}:00.000Z`),
        observedAt: new Date(`2026-06-22T10:1${index}:00.000Z`),
      }),
    );
    const otherTopicHistory = [500, 600, 700, 800, 900, 1000].map(
      (score, index) =>
        redditItem(
          `other-topic-history-${index}`,
          "niche-builders",
          score,
          40,
          {
            topicId: "topic-2",
            publishedAt: new Date(`2026-06-22T11:0${index}:00.000Z`),
            observedAt: new Date(`2026-06-22T11:1${index}:00.000Z`),
          },
        ),
    );

    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [target],
      baselineSamples: [...sameTopicHistory, ...otherTopicHistory].flatMap(
        (item) => {
          const sample = feedSignalBaselineSampleFromItem(item);

          return sample === undefined ? [] : [sample];
        },
      ),
      now,
    });

    expect(signals.get("all-topics-target")?.normalizedSignal.cohort).toEqual(
      expect.objectContaining({
        fallback: "source",
        baselineWindow: "7d",
        sampleSize: 5,
      }),
    );
  });

  it("keeps confidence lower when a cohort has little evidence", () => {
    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [
        redditItem("one", "indie-dev", 30, 4),
        redditItem("two", "indie-dev", 65, 8),
      ],
      now,
    });

    expect(signals.get("two")?.normalizedSignal.confidence).toBeLessThan(0.5);
  });

  it("prefers a recent exact cohort over stale popularity history", () => {
    const target = redditItem("recent-target", "fast-moving-ai", 80, 15);
    const recentHistory = [10, 20].map((score, index) =>
      redditItem(`recent-history-${index}`, "fast-moving-ai", score, 3, {
        observedAt: new Date(`2026-06-23T0${8 + index}:00:00.000Z`),
      }),
    );
    const staleHistory = [900, 1000, 1200, 1400].map((score, index) =>
      redditItem(`stale-history-${index}`, "fast-moving-ai", score, 80, {
        publishedAt: new Date(`2026-06-20T0${index}:00:00.000Z`),
        observedAt: new Date(`2026-06-20T0${index}:30:00.000Z`),
      }),
    );

    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [target],
      baselineSamples: [...recentHistory, ...staleHistory].flatMap((item) => {
        const sample = feedSignalBaselineSampleFromItem(item);

        return sample === undefined ? [] : [sample];
      }),
      now,
    });

    expect(signals.get("recent-target")?.normalizedSignal.cohort).toEqual(
      expect.objectContaining({
        fallback: "exact",
        baselineWindow: "24h",
        sampleSize: 3,
      }),
    );
    expect(
      signals.get("recent-target")?.normalizedSignal.score,
    ).toBeGreaterThan(80);
  });

  it("falls back to provider cohorts with lower confidence when exact and source samples are thin", () => {
    const target = redditItem("new-source-target", "brand-new-ai", 75, 11);
    const providerHistory = Array.from({ length: 9 }, (_, index) =>
      redditItem(
        `provider-history-${index}`,
        `neighbor-${index}`,
        20 + index * 5,
        4,
        {
          publishedAt: providerFallbackPublishedAt(index),
          observedAt: new Date(`2026-06-23T10:0${index}:00.000Z`),
        },
      ),
    );

    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [target],
      baselineSamples: providerHistory.flatMap((item) => {
        const sample = feedSignalBaselineSampleFromItem(item);

        return sample === undefined ? [] : [sample];
      }),
      now,
    });
    const signal = signals.get("new-source-target")?.normalizedSignal;

    expect(signal?.cohort).toEqual(
      expect.objectContaining({
        fallback: "provider",
        baselineWindow: "24h",
        sampleSize: 10,
      }),
    );
    expect(signal?.confidence).toBeLessThan(0.5);
  });

  it("preserves negative Reddit raw score while normalizing from non-negative strength", () => {
    const signals = new CohortBaselineFeedSignalNormalizer().normalize({
      items: [redditItem("downvoted", "indie-dev", -3, 2)],
      now,
    });

    expect(signals.get("downvoted")?.providerMetrics).toEqual(
      expect.objectContaining({
        kind: "reddit_post",
        score: -3,
        comments: 2,
      }),
    );
    expect(signals.get("downvoted")?.normalizedSignal.score).toBe(50);
  });
});

const redditCohort = (
  subreddit: string,
  scores: readonly number[],
): readonly FeedItem[] =>
  scores.map((score, index) =>
    redditItem(
      `${subreddit}-${index}`,
      subreddit,
      score,
      Math.max(1, Math.round(score / 5)),
    ),
  );

const redditItem = (
  id: string,
  subreddit: string,
  score: number,
  comments: number,
  overrides: {
    readonly topicId?: string;
    readonly publishedAt?: Date;
    readonly observedAt?: Date;
  } = {},
): FeedItem =>
  FeedItem.publish({
    id,
    tenantId: tenantId("tenant-1"),
    workspaceId: workspaceId("workspace-1"),
    topicId: overrides.topicId ?? "topic-1",
    sourceItemId: `source-${id}`,
    sourceBindingId: `binding-${subreddit}`,
    providerKey: "reddit",
    canonicalUrl: `https://reddit.test/r/${subreddit}/comments/${id}`,
    title: `Post ${id}`,
    bodyPreview: `Discussion ${id}`,
    authorHandle: "author",
    publishedAt: overrides.publishedAt ?? new Date("2026-06-23T06:30:00.000Z"),
    observedAt: overrides.observedAt ?? new Date("2026-06-23T07:00:00.000Z"),
    providerMetadata: {
      subreddit,
      score,
      numComments: comments,
      upvoteRatio: 0.91,
    },
  });

const providerFallbackPublishedAt = (index: number): Date => {
  const values = [
    "2026-06-23T11:30:00.000Z",
    "2026-06-23T10:30:00.000Z",
    "2026-06-23T08:30:00.000Z",
    "2026-06-23T04:30:00.000Z",
    "2026-06-22T22:30:00.000Z",
    "2026-06-22T10:30:00.000Z",
    "2026-06-21T10:30:00.000Z",
    "2026-06-20T10:30:00.000Z",
    "2026-06-19T10:30:00.000Z",
  ];

  return new Date(values[index] ?? "2026-06-23T11:30:00.000Z");
};
