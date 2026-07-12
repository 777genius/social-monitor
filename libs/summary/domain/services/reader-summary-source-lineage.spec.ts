import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  buildMatchedRules,
  buildWhyNow,
  confirmedProviderKeys,
  multiProviderClusterKeys,
} from "./reader-summary-source-lineage";

describe("reader summary source lineage", () => {
  it("builds explicit and fallback source attribution rules", () => {
    expect(
      buildMatchedRules(
        [evidence({ matchedRules: ["official_account"] })],
        ["ai-agents"],
        "hacker-news",
      ),
    ).toEqual([
      "official_account",
      "interest:ai-agents",
      "source-binding:binding-hacker-news",
      "provider:hacker-news",
    ]);
  });

  it("describes independent providers without counting the same origin twice", () => {
    const sources = [
      evidence({
        feedItemId: "hn-ant",
        providerKey: "hacker-news",
        providerName: "Hacker News",
        canonicalUrl: "https://news.ycombinator.com/item?id=123",
        sourceOriginUrl: "https://ant.example/",
      }),
      evidence({
        feedItemId: "rss-ant",
        providerKey: "rss",
        providerName: "RSS",
        canonicalUrl: "https://ant.example/",
      }),
    ];

    expect(
      confirmedProviderKeys({
        cluster: undefined,
        evidence: sources,
        providerKey: "hacker-news",
      }),
    ).toEqual(["hacker-news"]);
    expect(buildWhyNow(undefined, ["hacker-news"], sources)).toBe(
      "Current summary window has Hacker News coverage.",
    );
  });

  it("uses cluster providers only when no evidence lineage is available", () => {
    const cluster = storyCluster();

    expect(multiProviderClusterKeys(cluster)).toEqual(["reddit", "rss"]);
    expect(
      confirmedProviderKeys({
        cluster,
        evidence: [],
        providerKey: "reddit",
      }),
    ).toEqual(["reddit", "rss"]);
  });
});

const evidence = (
  overrides: Partial<SummaryEvidenceItem> = {},
): SummaryEvidenceItem => ({
  feedItemId: "feed-hacker-news",
  sourceItemId: "source-hacker-news",
  sourceBindingId: "binding-hacker-news",
  interestId: "ai-agents",
  providerKey: "hacker-news",
  providerName: "Hacker News",
  canonicalUrl: "https://news.ycombinator.com/item?id=123",
  title: "AI agent runtime discussion",
  publishedAt: new Date("2026-07-11T10:00:00.000Z"),
  observedAt: new Date("2026-07-11T10:05:00.000Z"),
  score: 2,
  whyImportant: ["Relevant to monitored AI tooling"],
  ...overrides,
});

const storyCluster = (): StoryCluster => ({
  id: "story:source-lineage",
  storyKey: "title:source-lineage",
  representativeFeedItemId: "feed-reddit",
  duplicateFeedItemIds: ["feed-rss"],
  interestIds: ["ai-agents"],
  providerKeys: ["reddit", "rss"],
  score: 2,
  observedAtRange: {
    startedAt: new Date("2026-07-11T10:00:00.000Z"),
    endedAt: new Date("2026-07-11T10:05:00.000Z"),
  },
  whyImportant: ["Relevant to monitored AI tooling"],
});
