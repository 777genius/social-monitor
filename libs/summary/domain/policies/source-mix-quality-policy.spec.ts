import {
  buildReaderSummaryQualityState,
  buildSourceMix,
} from "./source-mix-quality-policy";
import type { ReaderSummaryCitation } from "../entities/citation";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

describe("buildSourceMix", () => {
  it("excludes GitHub Trending from the reader-facing source mix", () => {
    const sourceMix = buildSourceMix({
      selectedEvidence: [
        evidenceItem("github-trending-page", 1),
        evidenceItem("github-trending-page", 2),
        evidenceItem("github-trending-page", 3),
        evidenceItem("hacker-news", 1),
        evidenceItem("x-twitter", 1),
        evidenceItem("reddit", 1),
      ],
      citationMap: [
        citation("github-trending-page", 1),
        citation("github-trending-page", 2),
        citation("github-trending-page", 3),
        citation("hacker-news", 1),
        citation("x-twitter", 1),
        citation("reddit", 1),
      ],
      storyClusters: [
        storyCluster("github-trending-page", 1),
        storyCluster("github-trending-page", 2),
        storyCluster("github-trending-page", 3),
        storyCluster("hacker-news", 1),
        storyCluster("x-twitter", 1),
        storyCluster("reddit", 1),
      ],
    });

    expect(sourceMix.map((entry) => entry.providerKey)).toEqual([
      "x-twitter",
      "reddit",
      "hacker-news",
    ]);
    expect(sourceMix.map((entry) => entry.itemCount)).toEqual([1, 1, 1]);
  });

  it("does not label multi-provider source-local coverage as a single source", () => {
    const sourceMix = buildSourceMix({
      selectedEvidence: [
        evidenceItem("x-twitter", 1),
        evidenceItem("reddit", 1),
        evidenceItem("hacker-news", 1),
      ],
      citationMap: [
        citation("x-twitter", 1),
        citation("reddit", 1),
        citation("hacker-news", 1),
      ],
      storyClusters: [
        storyCluster("x-twitter", 1),
        storyCluster("reddit", 1),
        storyCluster("hacker-news", 1),
      ],
    });

    expect(buildReaderSummaryQualityState([], sourceMix)).toEqual({
      status: "ready",
      flags: [],
      warnings: [
        "Top reads need confirmation from another monitored provider before acting on important claims.",
      ],
      isSingleSource: false,
    });
  });
});

const evidenceItem = (
  providerKey: string,
  index: number,
): SummaryEvidenceItem => ({
  feedItemId: `${providerKey}-feed-${index}`,
  sourceItemId: `${providerKey}-source-${index}`,
  sourceBindingId: `${providerKey}-binding`,
  interestId: "ai",
  providerKey,
  providerName: providerKey,
  canonicalUrl: `https://example.test/${providerKey}/${index}`,
  title: `${providerKey} item ${index}`,
  publishedAt: new Date("2026-06-28T08:00:00.000Z"),
  observedAt: new Date("2026-06-28T08:05:00.000Z"),
  score: 1,
  whyImportant: [`${providerKey} signal`],
});

const citation = (
  providerKey: string,
  index: number,
): ReaderSummaryCitation => ({
  citationId: `${providerKey}-citation-${index}`,
  feedItemId: `${providerKey}-feed-${index}`,
  sourceItemId: `${providerKey}-source-${index}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${providerKey}/${index}`,
});

const storyCluster = (providerKey: string, index: number): StoryCluster => ({
  id: `${providerKey}-cluster-${index}`,
  storyKey: `${providerKey}-story-${index}`,
  representativeFeedItemId: `${providerKey}-feed-${index}`,
  duplicateFeedItemIds: [],
  interestIds: ["ai"],
  providerKeys: [providerKey],
  score: 1,
  observedAtRange: {
    startedAt: new Date("2026-06-28T08:00:00.000Z"),
    endedAt: new Date("2026-06-28T08:05:00.000Z"),
  },
  whyImportant: [`${providerKey} story`],
});
