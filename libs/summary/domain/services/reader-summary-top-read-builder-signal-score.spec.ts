import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  evidenceClusterMap,
  storyToTopRead,
} from "./reader-summary-top-read-builder";

describe("reader summary top read builder signal score", () => {
  it("derives the top read signal score from content strength without engagement", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:rss-security",
      title: "Cybersecurity threat prompts scramble",
      summary: "Selected by reader-value semantic assessment.",
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      citationIds: ["citation-rss"],
    };
    const evidence: readonly SummaryEvidenceItem[] = [
      {
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        sourceBindingId: "binding-ai",
        interestId: "ai-agents",
        providerKey: "rss",
        providerName: "rss",
        canonicalUrl: "https://example.com/cybersecurity-scramble",
        title: "Cybersecurity threat prompts scramble",
        publishedAt: new Date("2026-10-21T22:45:30.000Z"),
        observedAt: new Date("2026-10-21T22:50:00.000Z"),
        score: 0,
        whyImportant: ["Substantive standalone coverage."],
        contentQuality: {
          qualityScore: 0.8,
          interestRelevanceScore: 0.7,
          engagementIntegrityScore: 1,
          eligibleForSummary: true,
          eligibleForTopRead: true,
          needsLlmReview: false,
          decision: "eligible",
          flags: [],
          reason: "Substantive standalone coverage.",
        },
      },
    ];
    const citations: readonly ReaderSummaryCitation[] = [
      {
        citationId: "citation-rss",
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
        field: "title",
        canonicalUrl: "https://example.com/cybersecurity-scramble",
      },
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.signalScore).toBe(7.818);
    expect(topRead.signalScore).toBeGreaterThan(0);
    // Confidence keeps the engagement-only signal so content strength only
    // changes the displayed Signal value.
    expect(topRead.confidence).toEqual(
      expect.objectContaining({ level: "low", score: 0.18 }),
    );
  });
});
