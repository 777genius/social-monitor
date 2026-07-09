import type { ReaderSummaryCitation } from "../entities/citation";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildReaderSummarySelectedPosts } from "./reader-summary-selected-posts";

describe("buildReaderSummarySelectedPosts", () => {
  it("keeps raw source boilerplate out of selected post reasons", () => {
    const posts = buildReaderSummarySelectedPosts({
      topReads: [],
      citationById: new Map([["c1", citation()]]),
      selectedEvidence: [
        {
          ...evidence(),
          whyImportant: [
            "Strong source engagement signal",
            "Source: https://www.ft.com/content/example",
          ],
          bodyPreview:
            "Illustration by Tag Hartman-Simkins / Futurism. Source: Shutterstock. Full raw article body should not be displayed.",
        },
      ],
    });

    expect(posts[0]?.whyImportant).toEqual([
      "Strong source engagement signal",
      "Meta AI spending pressure remains a monitored story",
    ]);
    expect(posts[0]?.reason).toBe("Strong source engagement signal");
  });

  it("keeps source-safety implementation notes out of selected post reasons", () => {
    const posts = buildReaderSummarySelectedPosts({
      topReads: [],
      citationById: new Map([["c1", citation()]]),
      selectedEvidence: [
        {
          ...evidence(),
          whyImportant: [
            "Unsafe source instructions were sandboxed before summarization",
            "Current summary window has multiple strong AI infrastructure signals",
          ],
        },
      ],
    });

    expect(posts[0]?.whyImportant).toEqual([
      "Current summary window has multiple strong AI infrastructure signals",
      "Meta AI spending pressure remains a monitored story",
    ]);
    expect(posts[0]?.reason).toBe(
      "Current summary window has multiple strong AI infrastructure signals",
    );
  });

  it("keeps source coverage implementation notes out of selected post reasons", () => {
    const posts = buildReaderSummarySelectedPosts({
      topReads: [],
      citationById: new Map([["c1", citation()]]),
      selectedEvidence: [
        {
          ...evidence(),
          whyImportant: [
            "Selected to preserve provider coverage in the reader summary window",
            "Strong source engagement signal",
          ],
        },
      ],
    });

    expect(posts[0]?.whyImportant).toEqual([
      "Strong source engagement signal",
      "Meta AI spending pressure remains a monitored story",
    ]);
    expect(posts[0]?.reason).toBe("Strong source engagement signal");
  });
});

const citation = (): ReaderSummaryCitation => ({
  citationId: "c1",
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  providerKey: "rss",
  field: "canonicalUrl",
  canonicalUrl: "https://example.test/story",
});

const evidence = (): SummaryEvidenceItem => ({
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  sourceBindingId: "binding-rss",
  interestId: "interest-ai",
  providerKey: "rss",
  providerName: "RSS",
  canonicalUrl: "https://example.test/story",
  title: "Meta AI spending pressure remains a monitored story",
  publishedAt: new Date("2026-07-02T10:00:00.000Z"),
  observedAt: new Date("2026-07-02T10:05:00.000Z"),
  score: 1.4,
  whyImportant: [],
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.8,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Test evidence",
  },
});
