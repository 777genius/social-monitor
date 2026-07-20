import type { ReaderSummaryCitation } from "../entities/citation";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildReaderSummarySelectedPosts } from "./reader-summary-selected-posts";

describe("buildReaderSummarySelectedPosts", () => {
  it("uses the original contentful excerpt without source boilerplate", () => {
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
            "Illustration by Tag Hartman-Simkins / Futurism. Source: Shutterstock. Meta said its AI infrastructure spending will rise substantially this year as demand for training capacity grows.",
        },
      ],
    });

    expect(posts[0]?.whyImportant).toEqual([
      "Meta said its AI infrastructure spending will rise substantially this year as demand for training capacity grows.",
      "Meta AI spending pressure remains a monitored story",
    ]);
    expect(posts[0]?.reason).toBe(
      "Meta said its AI infrastructure spending will rise substantially this year as demand for training capacity grows.",
    );
  });

  it("falls back to the original title instead of source-safety notes", () => {
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
      "Meta AI spending pressure remains a monitored story",
    ]);
    expect(posts[0]?.reason).toBe(
      "Meta AI spending pressure remains a monitored story",
    );
  });

  it("falls back to the original title instead of coverage notes", () => {
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
      "Meta AI spending pressure remains a monitored story",
    ]);
    expect(posts[0]?.reason).toBe(
      "Meta AI spending pressure remains a monitored story",
    );
  });

  it("keeps the curated AI description for a top read", () => {
    const basePost = buildReaderSummarySelectedPosts({
      topReads: [],
      citationById: new Map([["c1", citation()]]),
      selectedEvidence: [evidence()],
    })[0]!;
    const curatedTopRead = {
      ...basePost,
      title: "Curated reader title",
      reason:
        "The generated description explains the key development and why it matters to readers.",
      whyImportant: [
        "The generated description explains the key development and why it matters to readers.",
      ],
    };

    const posts = buildReaderSummarySelectedPosts({
      topReads: [curatedTopRead],
      citationById: new Map([["c1", citation()]]),
      selectedEvidence: [
        {
          ...evidence(),
          bodyPreview:
            "This original excerpt must not overwrite the curated top-read description.",
        },
      ],
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe("Curated reader title");
    expect(posts[0]?.reason).toBe(curatedTopRead.reason);
  });

  it("cleans links and bounds an original excerpt for display", () => {
    const posts = buildReaderSummarySelectedPosts({
      topReads: [],
      citationById: new Map([["c1", citation()]]),
      selectedEvidence: [
        {
          ...evidence(),
          bodyPreview: `**Original report:** builders describe the concrete rollout impact in detail. [Read more](https://example.test/report) ${"Additional source context remains useful to readers. ".repeat(10)}`,
        },
      ],
    });

    expect(
      posts[0]?.reason.startsWith(
        "Original report: builders describe the concrete rollout impact",
      ),
    ).toBe(true);
    expect(posts[0]?.reason).not.toContain("https://");
    expect(posts[0]?.reason.length).toBeLessThanOrEqual(360);
    expect(posts[0]?.reason.endsWith("...")).toBe(true);
  });

  it("preserves first-party authority for selected post pagination", () => {
    const posts = buildReaderSummarySelectedPosts({
      topReads: [],
      citationById: new Map([
        ["c1", { ...citation(), providerKey: "x-twitter" }],
      ]),
      selectedEvidence: [
        {
          ...evidence(),
          providerKey: "x-twitter",
          providerName: "X/Twitter",
          contentQuality: {
            ...evidence().contentQuality!,
            flags: ["official_account", "trusted_author"],
          },
        },
      ],
    });

    expect(posts[0]?.confidence.level).toBe("medium");
    expect(posts[0]?.confidence.rationale).toContain("first-party official");
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
