import { buildReaderSummaryClaimQuality } from "./reader-summary-claim-quality";

describe("buildReaderSummaryClaimQuality", () => {
  it("allows high confidence when an official first-party X source is independently discussed", () => {
    const report = buildReaderSummaryClaimQuality({
      view: claimView(),
      feedItems: feedItems("OpenAI"),
    });

    expect(report.socialOnlyConfidentClaimCount).toBe(0);
    expect(report.gates.noSocialOnlyConfidentClaims).toBe(true);
  });

  it("blocks unqualified high confidence from community-only social sources", () => {
    const report = buildReaderSummaryClaimQuality({
      view: claimView(),
      feedItems: feedItems("random_account"),
    });

    expect(report.socialOnlyConfidentClaimCount).toBe(1);
    expect(report.gates.noSocialOnlyConfidentClaims).toBe(false);
  });
});

const claimView = () => ({
  content: {
    topReads: [{}],
    claimBoard: [
      {
        confidence: { level: "high" as const },
        risks: [],
        evidence: [{ providerKey: "x-twitter" }, { providerKey: "reddit" }],
        citationIds: ["citation-x", "citation-reddit"],
      },
    ],
  },
  citations: [
    {
      citationId: "citation-x",
      feedItemId: "feed-x",
      providerKey: "x-twitter",
    },
    {
      citationId: "citation-reddit",
      feedItemId: "feed-reddit",
      providerKey: "reddit",
    },
  ],
  confidence: { level: "high" as const },
  coverage: { crossSourceClusterCount: 1 },
});

const feedItems = (xAuthorHandle: string) => [
  {
    id: "feed-x",
    providerKey: "x-twitter",
    canonicalUrl: `https://x.com/${xAuthorHandle}/status/1`,
    authorHandle: xAuthorHandle,
    title: "OpenAI announces GPT-5.6 for developers this Thursday",
    providerMetadata: {
      kind: "x_post",
      likes: 2_000,
      reposts: 300,
      replies: 100,
      searchQuery: "OpenAI GPT-5.6 AI developer tools",
    },
  },
  {
    id: "feed-reddit",
    providerKey: "reddit",
    canonicalUrl: "https://reddit.com/r/OpenAI/comments/1",
    authorHandle: "community_member",
    title: "Developers discuss the GPT-5.6 announcement",
    providerMetadata: { kind: "reddit_post", score: 500, comments: 100 },
  },
];
