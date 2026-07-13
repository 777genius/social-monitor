import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  evidenceClusterMap,
  storyToTopRead,
} from "./reader-summary-top-read-builder";
import {
  readerSummaryEditorialCurationRule,
  withReaderSummaryEditorialCuration,
} from "../policies/reader-summary-editorial-curation-policy";

describe("reader summary top read source lineage", () => {
  it("salvages useful model context after removing unsupported provider sentences", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:apple-openai-lawsuit",
      title: "Apple trade-secret lawsuit against OpenAI draws attention",
      summary:
        "Reddit and Hacker News titles framed the dispute as a trade-secret theft claim. An RSS headline added unrelated leadership context. The useful takeaway is not that the allegations are proven, but that the dispute matters for AI platform strategy, hiring and intellectual-property risk.",
      interestIds: ["ai-agents"],
      providerKeys: ["reddit"],
      citationIds: ["citation-reddit"],
    };
    const evidence = redditEvidence();
    const cluster = storyCluster(story, evidence);
    const citation: ReaderSummaryCitation = {
      citationId: "citation-reddit",
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      providerKey: evidence.providerKey,
      field: "title",
      canonicalUrl: evidence.canonicalUrl,
    };
    const evidenceByFeedItemId = new Map([
      [evidence.feedItemId, evidence] as const,
    ]);

    const topRead = storyToTopRead(
      story,
      new Map([[citation.citationId, citation]]),
      evidenceByFeedItemId,
      new Map([[cluster.id, cluster]]),
      evidenceClusterMap([cluster], evidenceByFeedItemId),
    );

    expect(topRead.reason).toBe(
      "The useful takeaway is not that the allegations are proven, but that the dispute matters for AI platform strategy, hiring and intellectual-property risk.",
    );
    expect(topRead.title).toBe(
      "Reports say Apple sued OpenAI over alleged trade secret theft",
    );
    expect(topRead.reason).not.toMatch(/Hacker News|RSS/u);
  });

  it("persists editorial curation provenance as a non-public matched rule", () => {
    const baseStory: TopReadCandidate = {
      storyClusterId: "story:curated-comparison",
      title: "Coding-agent cost comparison",
      summary:
        "A detailed same-task comparison reports materially different cost and quota use across two coding-agent harnesses. It matters because teams increasingly choose tools by workflow economics, not only model quality. Treat the numbers as one source-scoped test until the setup is reproduced independently.",
      interestIds: ["ai-agents"],
      providerKeys: ["reddit"],
      citationIds: ["citation-reddit"],
    };
    const story = withReaderSummaryEditorialCuration(baseStory, true);
    const evidence = redditEvidence();
    const cluster = storyCluster(story, evidence);
    const citation: ReaderSummaryCitation = {
      citationId: "citation-reddit",
      feedItemId: evidence.feedItemId,
      sourceItemId: evidence.sourceItemId,
      providerKey: evidence.providerKey,
      field: "title",
      canonicalUrl: evidence.canonicalUrl,
    };
    const evidenceByFeedItemId = new Map([
      [evidence.feedItemId, evidence] as const,
    ]);

    const topRead = storyToTopRead(
      story,
      new Map([[citation.citationId, citation]]),
      evidenceByFeedItemId,
      new Map([[cluster.id, cluster]]),
      evidenceClusterMap([cluster], evidenceByFeedItemId),
    );

    expect(topRead.matchedRules).toContain(readerSummaryEditorialCurationRule);
  });
});

const redditEvidence = (): SummaryEvidenceItem => ({
  feedItemId: "feed-reddit-lawsuit",
  sourceItemId: "source-reddit-lawsuit",
  sourceBindingId: "binding-ai",
  interestId: "ai-agents",
  providerKey: "reddit",
  providerName: "Reddit",
  canonicalUrl: "https://reddit.com/r/ai/example",
  title: "Apple sues OpenAI over alleged trade secret theft",
  bodyPreview: "",
  publishedAt: new Date("2026-07-12T09:00:00.000Z"),
  observedAt: new Date("2026-07-12T09:05:00.000Z"),
  score: 2.4,
  whyImportant: [],
});

const storyCluster = (
  story: TopReadCandidate,
  evidence: SummaryEvidenceItem,
): StoryCluster => ({
  id: story.storyClusterId,
  storyKey: "url:reddit.com/apple-openai-lawsuit",
  representativeFeedItemId: evidence.feedItemId,
  duplicateFeedItemIds: [],
  interestIds: story.interestIds,
  providerKeys: ["reddit"],
  score: 2.4,
  observedAtRange: {
    startedAt: evidence.observedAt,
    endedAt: new Date(evidence.observedAt.getTime() + 1),
  },
  whyImportant: [],
});
