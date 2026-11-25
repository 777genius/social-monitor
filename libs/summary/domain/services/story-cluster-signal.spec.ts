import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { storyClusterSignal } from "./story-cluster-signal";

describe("storyClusterSignal source lineage", () => {
  it("uses the independent RSS publication score instead of a stronger mirror", () => {
    const signal = storyClusterSignal(
      [
        evidence({
          feedItemId: "hn-origin-b",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=123",
          sourceOriginUrl: "https://origin-b.example/post",
          score: 2,
        }),
        evidence({
          feedItemId: "rss-origin-b-mirror",
          providerKey: "rss",
          canonicalUrl: "https://origin-b.example/post",
          score: 1.9,
        }),
        evidence({
          feedItemId: "rss-origin-a-independent",
          providerKey: "rss",
          canonicalUrl: "https://origin-a.example/analysis",
          score: 0.7,
        }),
      ],
      new Date("2026-07-11T18:00:00.000Z"),
      STORY_RANKING_POLICY_V1,
    );

    expect(signal.breakdown).toEqual(
      expect.objectContaining({
        crossProviderSupport: 0.126,
        providerDiversityBoost: 0.25,
      }),
    );
  });

  it("does not reward duplicate snapshots of the same provider origin", () => {
    const signal = storyClusterSignal(
      [
        evidence({
          feedItemId: "reddit-first-snapshot",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.com/r/ai/comments/same-post",
          score: 2,
        }),
        evidence({
          feedItemId: "reddit-second-snapshot",
          providerKey: "reddit",
          canonicalUrl:
            "https://reddit.com/r/ai/comments/same-post?utm_source=refresh",
          score: 1.9,
        }),
      ],
      new Date("2026-07-11T18:00:00.000Z"),
      STORY_RANKING_POLICY_V1,
    );

    expect(signal.breakdown?.sameProviderSupport).toBe(0);
  });

  it("does not grant cross-provider signal to X aliases", () => {
    const signal = storyClusterSignal(
      [
        evidence({
          feedItemId: "x-alias",
          providerKey: "x",
          canonicalUrl: "https://x.example/status/1",
          score: 2,
        }),
        evidence({
          feedItemId: "x-twitter-alias",
          providerKey: "x-twitter",
          canonicalUrl: "https://x.example/status/2",
          score: 1.8,
        }),
        evidence({
          feedItemId: "twitter-alias",
          providerKey: "twitter",
          canonicalUrl: "https://x.example/status/3",
          score: 1.6,
        }),
      ],
      new Date("2026-07-11T18:00:00.000Z"),
      STORY_RANKING_POLICY_V1,
    );

    expect(signal.breakdown).toEqual(expect.objectContaining({
      crossProviderSupport: 0,
      providerDiversityBoost: 0,
    }));
    expect(signal.reasons.join(" ")).not.toContain("source groups");
  });

  it("keeps X and Reddit as independent provider signal", () => {
    const signal = storyClusterSignal(
      [
        evidence({
          feedItemId: "x-story",
          providerKey: "x-twitter",
          canonicalUrl: "https://x.example/status/4",
          score: 2,
        }),
        evidence({
          feedItemId: "reddit-story",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.example/r/ai/comments/4",
          score: 1.8,
        }),
      ],
      new Date("2026-07-11T18:00:00.000Z"),
      STORY_RANKING_POLICY_V1,
    );

    expect(signal.breakdown).toEqual(expect.objectContaining({
      crossProviderSupport: 0.3,
      providerDiversityBoost: 0.25,
    }));
  });
});

const evidence = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed",
  sourceItemId: "source",
  sourceBindingId: "binding",
  interestId: "ai-developer-tools",
  providerKey: "rss",
  canonicalUrl: "https://example.test/story",
  title: "Relevant AI tooling story",
  publishedAt: new Date("2026-07-11T12:00:00.000Z"),
  observedAt: new Date("2026-07-11T12:05:00.000Z"),
  score: 1,
  whyImportant: ["Relevant AI tooling evidence"],
  ...overrides,
});
