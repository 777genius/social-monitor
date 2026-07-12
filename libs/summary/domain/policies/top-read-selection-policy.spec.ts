import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import { selectUniqueTopReadCandidates } from "./top-read-selection-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

describe("selectUniqueTopReadCandidates", () => {
  it("keeps low-engagement X and Hacker News evidence out of reader top reads", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("weak-x", "Weak X chatter", "c-weak-x", ["x-twitter"]),
        story("strong-x", "Strong X rollout", "c-strong-x", ["x-twitter"]),
        story("weak-hn", "Weak HN discussion", "c-weak-hn", ["hacker-news"]),
      ],
      citations([
        citation("c-weak-x", "feed-weak-x", "x-twitter"),
        citation("c-strong-x", "feed-strong-x", "x-twitter"),
        citation("c-weak-hn", "feed-weak-hn", "hacker-news"),
      ]),
      evidence([
        evidenceItem("feed-weak-x", "x-twitter", [
          ["Likes", "1"],
          ["Reposts", "0"],
          ["Replies", "1"],
        ]),
        evidenceItem("feed-strong-x", "x-twitter", [
          ["Likes", "480"],
          ["Reposts", "92"],
          ["Replies", "44"],
        ]),
        evidenceItem("feed-weak-hn", "hacker-news", [
          ["Points", "3"],
          ["Comments", "0"],
        ]),
      ]),
      clusters(["weak-x", "strong-x", "weak-hn"]),
    );

    expect(result.map((item) => item.title)).toEqual(["Strong X rollout"]);
  });

  it("uses the strong citation from a mixed story instead of letting weak evidence lead", () => {
    const result = selectUniqueTopReadCandidates(
      [
        {
          ...story("mixed", "Agent tooling is moving", "c-weak-hn", [
            "hacker-news",
            "github-trending-page",
          ]),
          citationIds: ["c-weak-hn", "c-strong-gh"],
        },
      ],
      citations([
        citation("c-weak-hn", "feed-weak-hn", "hacker-news"),
        citation("c-strong-gh", "feed-strong-gh", "github-trending-page"),
      ]),
      evidence([
        evidenceItem("feed-weak-hn", "hacker-news", [
          ["Points", "1"],
          ["Comments", "0"],
        ]),
        evidenceItem("feed-strong-gh", "github-trending-page", [
          ["GitHub Trending daily", "#3, +266 stars today"],
          ["Stars", "62,183"],
        ]),
      ]),
      clusters(["mixed"]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.citationIds).toEqual(["c-strong-gh"]);
  });

  it("uses engagement metrics as a tie-breaker for close same-provider top reads", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("weak-hn", "Small HN discussion", "c-weak-hn", ["hacker-news"]),
        story("strong-hn", "Major HN discussion", "c-strong-hn", [
          "hacker-news",
        ]),
      ],
      citations([
        citation("c-weak-hn", "feed-weak-hn", "hacker-news"),
        citation("c-strong-hn", "feed-strong-hn", "hacker-news"),
      ]),
      evidence([
        evidenceItem("feed-weak-hn", "hacker-news", [
          ["Points", "5"],
          ["Comments", "9"],
        ]),
        evidenceItem("feed-strong-hn", "hacker-news", [
          ["Points", "338"],
          ["Comments", "44"],
        ]),
      ]),
      clusters(["weak-hn", "strong-hn"]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "Major HN discussion",
      "Small HN discussion",
    ]);
  });

  it("orders close cross-provider discussion reads by engagement strength", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("x", "X rollout", "c-x", ["x-twitter"]),
        story("hn", "HN discussion", "c-hn", ["hacker-news"]),
      ],
      citations([
        citation("c-x", "feed-x", "x-twitter"),
        citation("c-hn", "feed-hn", "hacker-news"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-x", "x-twitter", [
            ["Likes", "2,000"],
            ["Replies", "90"],
          ]),
          score: 2.21,
        },
        {
          ...evidenceItem("feed-hn", "hacker-news", [
            ["Points", "340"],
            ["Comments", "170"],
          ]),
          score: 2.27,
        },
      ]),
      new Map([
        [
          "story:x",
          cluster({
            id: "x",
            representativeFeedItemId: "feed-x",
            providerKeys: ["x-twitter"],
            score: 2.21,
          }),
        ],
        [
          "story:hn",
          cluster({
            id: "hn",
            representativeFeedItemId: "feed-hn",
            providerKeys: ["hacker-news"],
            score: 2.27,
          }),
        ],
      ]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "X rollout",
      "HN discussion",
    ]);
  });

  it("balances top reads with primary social minimums and dominant provider caps", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("reddit-1", "Reddit discussion 1", "c-reddit-1", ["reddit"]),
        story("reddit-2", "Reddit discussion 2", "c-reddit-2", ["reddit"]),
        story("reddit-3", "Reddit discussion 3", "c-reddit-3", ["reddit"]),
        story("reddit-4", "Reddit discussion 4", "c-reddit-4", ["reddit"]),
        story("reddit-5", "Reddit discussion 5", "c-reddit-5", ["reddit"]),
        story("x-1", "X discussion 1", "c-x-1", ["x-twitter"]),
        story("x-2", "X discussion 2", "c-x-2", ["x-twitter"]),
        story("hn-1", "HN discussion", "c-hn-1", ["hacker-news"]),
        story("rss-1", "RSS article", "c-rss-1", ["rss"]),
      ],
      citations([
        citation("c-reddit-1", "feed-reddit-1", "reddit"),
        citation("c-reddit-2", "feed-reddit-2", "reddit"),
        citation("c-reddit-3", "feed-reddit-3", "reddit"),
        citation("c-reddit-4", "feed-reddit-4", "reddit"),
        citation("c-reddit-5", "feed-reddit-5", "reddit"),
        citation("c-x-1", "feed-x-1", "x-twitter"),
        citation("c-x-2", "feed-x-2", "x-twitter"),
        citation("c-hn-1", "feed-hn-1", "hacker-news"),
        citation("c-rss-1", "feed-rss-1", "rss"),
      ]),
      evidence([
        evidenceItem("feed-reddit-1", "reddit", [
          ["Score", "727"],
          ["Comments", "140"],
        ]),
        evidenceItem("feed-reddit-2", "reddit", [
          ["Score", "527"],
          ["Comments", "80"],
        ]),
        evidenceItem("feed-reddit-3", "reddit", [
          ["Score", "427"],
          ["Comments", "60"],
        ]),
        evidenceItem("feed-reddit-4", "reddit", [
          ["Score", "327"],
          ["Comments", "40"],
        ]),
        evidenceItem("feed-reddit-5", "reddit", [
          ["Score", "227"],
          ["Comments", "20"],
        ]),
        evidenceItem("feed-x-1", "x-twitter", [
          ["Likes", "480"],
          ["Reposts", "92"],
        ]),
        evidenceItem("feed-x-2", "x-twitter", [
          ["Likes", "380"],
          ["Reposts", "72"],
        ]),
        evidenceItem("feed-hn-1", "hacker-news", [
          ["Score", "727"],
          ["Comments", "140"],
        ]),
        evidenceItem("feed-rss-1", "rss", []),
      ]),
      clusters([
        "reddit-1",
        "reddit-2",
        "reddit-3",
        "reddit-4",
        "reddit-5",
        "x-1",
        "x-2",
        "hn-1",
        "rss-1",
      ]),
      8,
    );

    expect(result.map((item) => item.title)).toEqual([
      "X discussion 1",
      "X discussion 2",
      "Reddit discussion 1",
      "HN discussion",
      "Reddit discussion 2",
      "Reddit discussion 3",
      "RSS article",
    ]);
    expect(providerCounts(result)).toEqual({
      reddit: 3,
      "x-twitter": 2,
      "hacker-news": 1,
      rss: 1,
    });
  });

  it("promotes stronger social evidence above weak single-source reads", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("weak-x", "Weak X chatter", "c-weak-x", ["x-twitter"]),
        {
          ...story("strong-reddit", "Cross-source Reddit signal", "c-reddit", [
            "reddit",
            "rss",
          ]),
          citationIds: ["c-reddit", "c-rss"],
        },
        story("weak-hn", "Weak HN follow-up", "c-weak-hn", ["hacker-news"]),
      ],
      citations([
        citation("c-weak-x", "feed-weak-x", "x-twitter"),
        citation("c-reddit", "feed-reddit", "reddit"),
        citation("c-rss", "feed-rss", "rss"),
        citation("c-weak-hn", "feed-weak-hn", "hacker-news"),
      ]),
      evidence([
        evidenceItem("feed-weak-x", "x-twitter", [["Likes", "240"]], {
          eligibleForTopRead: true,
        }),
        {
          ...evidenceItem("feed-reddit", "reddit", [
            ["Score", "940"],
            ["Comments", "220"],
          ]),
          score: 2.3,
        },
        {
          ...evidenceItem("feed-rss", "rss", []),
          score: 2.1,
        },
        evidenceItem("feed-weak-hn", "hacker-news", [["Points", "35"]], {
          eligibleForTopRead: true,
        }),
      ]),
      new Map([
        [
          "story:weak-x",
          cluster({
            id: "weak-x",
            representativeFeedItemId: "feed-weak-x",
            providerKeys: ["x-twitter"],
            score: 1.89,
          }),
        ],
        [
          "story:strong-reddit",
          cluster({
            id: "strong-reddit",
            representativeFeedItemId: "feed-reddit",
            duplicateFeedItemIds: ["feed-rss"],
            providerKeys: ["reddit", "rss"],
            score: 3.1,
            signalBreakdown: {
              baseScore: 2.3,
              crossProviderSupport: 0.22,
              sameProviderSupport: 0,
              providerDiversityBoost: 0.12,
              interestDiversityBoost: 0,
              freshnessBoost: 0,
              totalScore: 3.1,
            },
          }),
        ],
        [
          "story:weak-hn",
          cluster({
            id: "weak-hn",
            representativeFeedItemId: "feed-weak-hn",
            providerKeys: ["hacker-news"],
            score: 1.98,
          }),
        ],
      ]),
    );

    expect(result[0]?.title).toBe("Cross-source Reddit signal");
  });

  it("keeps stronger same-provider supported reads above weak earlier picks", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("weak-x", "J-Space reached X", "c-weak-x", ["x-twitter"]),
        {
          ...story("supported-x", "Claude open source expansion", "c-x-main", [
            "x-twitter",
          ]),
          citationIds: ["c-x-main", "c-x-support"],
        },
      ],
      citations([
        citation("c-weak-x", "feed-weak-x", "x-twitter"),
        citation("c-x-main", "feed-x-main", "x-twitter"),
        citation("c-x-support", "feed-x-support", "x-twitter"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-weak-x", "x-twitter", [["Likes", "180"]], {
            eligibleForTopRead: true,
          }),
          score: 1.78,
        },
        {
          ...evidenceItem("feed-x-main", "x-twitter", [
            ["Likes", "1,800"],
            ["Reposts", "180"],
          ]),
          score: 2.14,
        },
        {
          ...evidenceItem("feed-x-support", "x-twitter", [
            ["Likes", "900"],
            ["Reposts", "70"],
          ]),
          score: 2.02,
        },
      ]),
      new Map([
        [
          "story:weak-x",
          cluster({
            id: "weak-x",
            representativeFeedItemId: "feed-weak-x",
            providerKeys: ["x-twitter"],
            score: 1.78,
          }),
        ],
        [
          "story:supported-x",
          cluster({
            id: "supported-x",
            representativeFeedItemId: "feed-x-main",
            duplicateFeedItemIds: ["feed-x-support"],
            providerKeys: ["x-twitter"],
            score: 2.14,
          }),
        ],
      ]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "Claude open source expansion",
      "J-Space reached X",
    ]);
  });

  it("lets a stronger cross-source article lead a weak standalone HN discussion", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("hn", "Eligible HN discussion", "c-hn", ["hacker-news"]),
        {
          ...story("rss", "RSS cross-source article", "c-rss", [
            "rss",
            "hacker-news",
          ]),
          citationIds: ["c-rss", "c-rss-support"],
        },
      ],
      citations([
        citation("c-hn", "feed-hn", "hacker-news"),
        citation("c-rss", "feed-rss", "rss"),
        citation("c-rss-support", "feed-rss-support", "hacker-news"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-hn", "hacker-news", [
            ["Points", "25"],
            ["Comments", "9"],
          ]),
          score: 1.7,
        },
        {
          ...evidenceItem("feed-rss", "rss", []),
          score: 2.4,
        },
        {
          ...evidenceItem("feed-rss-support", "hacker-news", [
            ["Points", "40"],
            ["Comments", "12"],
          ]),
          score: 2.1,
        },
      ]),
      new Map(),
    );

    expect(result.map((item) => item.title)).toEqual([
      "RSS cross-source article",
      "Eligible HN discussion",
    ]);
  });

  it("does not count RSS mirrors of Hacker News as independent source support", () => {
    const result = selectUniqueTopReadCandidates(
      [
        {
          ...story("typescript", "TypeScript rewrite", "c-hn", [
            "hacker-news",
            "rss",
          ]),
          citationIds: ["c-hn", "c-rss"],
        },
        {
          ...story("claude", "Claude access extension", "c-x-main", [
            "x-twitter",
          ]),
          citationIds: ["c-x-main", "c-x-support"],
        },
      ],
      citations([
        {
          ...citation("c-hn", "feed-hn", "hacker-news"),
          canonicalUrl: "https://news.ycombinator.com/item?id=48823421",
        },
        {
          ...citation("c-rss", "feed-rss", "rss"),
          canonicalUrl: "https://news.ycombinator.com/item?id=48823421",
        },
        citation("c-x-main", "feed-x-main", "x-twitter"),
        citation("c-x-support", "feed-x-support", "x-twitter"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-hn", "hacker-news", [
            ["Points", "28"],
            ["Comments", "3"],
          ]),
          canonicalUrl: "https://news.ycombinator.com/item?id=48823421",
          score: 1.86,
        },
        {
          ...evidenceItem("feed-rss", "rss", []),
          canonicalUrl: "https://news.ycombinator.com/item?id=48823421",
          score: 1.7,
        },
        {
          ...evidenceItem("feed-x-main", "x-twitter", [
            ["Likes", "79,000"],
            ["Reposts", "9,100"],
          ]),
          score: 2.2,
        },
        {
          ...evidenceItem("feed-x-support", "x-twitter", [
            ["Likes", "12,000"],
            ["Reposts", "1,100"],
          ]),
          score: 2.05,
        },
      ]),
      new Map([
        [
          "story:typescript",
          cluster({
            id: "typescript",
            representativeFeedItemId: "feed-hn",
            duplicateFeedItemIds: ["feed-rss"],
            providerKeys: ["hacker-news", "rss"],
            score: 1.86,
          }),
        ],
        [
          "story:claude",
          cluster({
            id: "claude",
            representativeFeedItemId: "feed-x-main",
            duplicateFeedItemIds: ["feed-x-support"],
            providerKeys: ["x-twitter"],
            score: 2.2,
          }),
        ],
      ]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "Claude access extension",
      "TypeScript rewrite",
    ]);
  });

  it("does not count loose model citations outside a cluster as ranking support", () => {
    const result = selectUniqueTopReadCandidates(
      [
        {
          ...story("typescript", "TypeScript Go rewrite", "c-hn", [
            "hacker-news",
          ]),
          citationIds: ["c-hn", "c-rss-loose"],
        },
        {
          ...story("claude", "Claude Fable extension", "c-x-main", [
            "x-twitter",
          ]),
          citationIds: ["c-x-main", "c-x-support"],
        },
      ],
      citations([
        citation("c-hn", "feed-hn", "hacker-news"),
        citation("c-rss-loose", "feed-rss-loose", "rss"),
        citation("c-x-main", "feed-x-main", "x-twitter"),
        citation("c-x-support", "feed-x-support", "x-twitter"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-hn", "hacker-news", [
            ["Points", "28"],
            ["Comments", "3"],
          ]),
          score: 1.86,
        },
        {
          ...evidenceItem("feed-rss-loose", "rss", []),
          canonicalUrl: "https://example.com/related-go-post",
          score: 1.7,
        },
        {
          ...evidenceItem("feed-x-main", "x-twitter", [
            ["Likes", "79,000"],
            ["Reposts", "9,100"],
          ]),
          score: 2.2,
        },
        {
          ...evidenceItem("feed-x-support", "x-twitter", [
            ["Likes", "12,000"],
            ["Reposts", "1,100"],
          ]),
          score: 2.05,
        },
      ]),
      new Map([
        [
          "story:typescript",
          cluster({
            id: "typescript",
            representativeFeedItemId: "feed-hn",
            providerKeys: ["hacker-news"],
            score: 1.86,
          }),
        ],
        [
          "story:claude",
          cluster({
            id: "claude",
            representativeFeedItemId: "feed-x-main",
            duplicateFeedItemIds: ["feed-x-support"],
            providerKeys: ["x-twitter"],
            score: 2.2,
          }),
        ],
      ]),
    );

    expect(result.map((item) => item.title)).toEqual([
      "Claude Fable extension",
      "TypeScript Go rewrite",
    ]);
  });

  it("preserves support citations when supplementing a cross-source cluster", () => {
    const result = selectUniqueTopReadCandidates(
      [],
      citations([
        citation("c-rss", "feed-rss", "rss"),
        citation("c-hn", "feed-hn", "hacker-news"),
      ]),
      evidence([
        {
          ...evidenceItem("feed-rss", "rss", []),
          score: 2.7,
        },
        {
          ...evidenceItem("feed-hn", "hacker-news", [
            ["Points", "42"],
            ["Comments", "17"],
          ]),
          score: 2.2,
        },
      ]),
      new Map([
        [
          "story:tracker",
          cluster({
            id: "tracker",
            representativeFeedItemId: "feed-rss",
            duplicateFeedItemIds: ["feed-hn"],
            providerKeys: ["rss", "hacker-news"],
            score: 2.69,
          }),
        ],
      ]),
    );

    expect(result[0]?.providerKeys).toEqual(["rss", "hacker-news"]);
    expect(result[0]?.citationIds).toEqual(["c-rss", "c-hn"]);
  });

  it("fills from eligible selected evidence and caps a dominant social provider", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story("x-1", "X discussion 1", "c-x-1", ["x-twitter"]),
        story("x-2", "X discussion 2", "c-x-2", ["x-twitter"]),
        story("x-3", "X discussion 3", "c-x-3", ["x-twitter"]),
        story("x-4", "X discussion 4", "c-x-4", ["x-twitter"]),
        story("x-5", "X discussion 5", "c-x-5", ["x-twitter"]),
        story("x-6", "X discussion 6", "c-x-6", ["x-twitter"]),
        story("x-7", "X discussion 7", "c-x-7", ["x-twitter"]),
      ],
      citations([
        citation("c-x-1", "feed-x-1", "x-twitter"),
        citation("c-x-2", "feed-x-2", "x-twitter"),
        citation("c-x-3", "feed-x-3", "x-twitter"),
        citation("c-x-4", "feed-x-4", "x-twitter"),
        citation("c-x-5", "feed-x-5", "x-twitter"),
        citation("c-x-6", "feed-x-6", "x-twitter"),
        citation("c-x-7", "feed-x-7", "x-twitter"),
        citation("c-reddit-1", "feed-reddit-1", "reddit"),
        citation("c-reddit-2", "feed-reddit-2", "reddit"),
        citation("c-reddit-3", "feed-reddit-3", "reddit"),
        citation("c-reddit-4", "feed-reddit-4", "reddit"),
        citation("c-reddit-5", "feed-reddit-5", "reddit"),
      ]),
      evidence([
        evidenceItem("feed-x-1", "x-twitter", [["Likes", "710"]]),
        evidenceItem("feed-x-2", "x-twitter", [["Likes", "690"]]),
        evidenceItem("feed-x-3", "x-twitter", [["Likes", "670"]]),
        evidenceItem("feed-x-4", "x-twitter", [["Likes", "650"]]),
        evidenceItem("feed-x-5", "x-twitter", [["Likes", "630"]]),
        evidenceItem("feed-x-6", "x-twitter", [["Likes", "610"]]),
        evidenceItem("feed-x-7", "x-twitter", [["Likes", "590"]]),
        evidenceItem("feed-reddit-1", "reddit", [["Score", "580"]]),
        evidenceItem("feed-reddit-2", "reddit", [["Score", "560"]]),
        evidenceItem("feed-reddit-3", "reddit", [["Score", "540"]]),
        evidenceItem("feed-reddit-4", "reddit", [["Score", "520"]]),
        evidenceItem("feed-reddit-5", "reddit", [["Score", "500"]]),
      ]),
      clusters(["x-1", "x-2", "x-3", "x-4", "x-5", "x-6", "x-7"]),
      10,
    );

    expect(result).toHaveLength(10);
    expect(providerCounts(result)).toEqual({
      reddit: 4,
      "x-twitter": 6,
    });
    expect(result.map((item) => item.title)).toEqual([
      "X discussion 1",
      "X discussion 2",
      "X discussion 3",
      "X discussion 4",
      "X discussion 5",
      "X discussion 6",
      "feed-reddit-1",
      "feed-reddit-2",
      "feed-reddit-3",
      "feed-reddit-4",
    ]);
  });

  it("keeps weak-topic high-engagement Reddit evidence out of top reads", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story(
          "reddit-gaming",
          "The game industry is making me incredibly depressed and I'm done",
          "c-reddit-gaming",
          ["reddit"],
        ),
      ],
      citations([citation("c-reddit-gaming", "feed-reddit-gaming", "reddit")]),
      evidence([
        evidenceItem(
          "feed-reddit-gaming",
          "reddit",
          [
            ["Score", "10,132"],
            ["Comments", "2,700"],
          ],
          {
            qualityScore: 0.79,
            interestRelevanceScore: 0.38,
            eligibleForTopRead: false,
            needsLlmReview: true,
            decision: "downrank",
            flags: ["weak_topic_match"],
            reason: "downrank because weak_topic_match",
          },
        ),
      ]),
      clusters(["reddit-gaming"]),
    );

    expect(result).toEqual([]);
  });

  it("hard-blocks weak_topic_match even if a stale verdict marks the item top-read eligible", () => {
    const result = selectUniqueTopReadCandidates(
      [
        story(
          "reddit-weak-topic",
          "High engagement but weak topic match",
          "c-reddit-weak-topic",
          ["reddit"],
        ),
      ],
      citations([
        citation("c-reddit-weak-topic", "feed-reddit-weak-topic", "reddit"),
      ]),
      evidence([
        evidenceItem(
          "feed-reddit-weak-topic",
          "reddit",
          [
            ["Score", "8,000"],
            ["Comments", "1,400"],
          ],
          {
            eligibleForTopRead: true,
            flags: ["weak_topic_match"],
          },
        ),
      ]),
      clusters(["reddit-weak-topic"]),
    );

    expect(result).toEqual([]);
  });

  it("drops citationless stories when their cluster has no top-read eligible evidence", () => {
    const result = selectUniqueTopReadCandidates(
      [
        {
          ...story("generic-hn", "Generic high-engagement HN item", "unused", [
            "hacker-news",
          ]),
          citationIds: [],
        },
      ],
      citations([citation("c-generic-hn", "feed-generic-hn", "hacker-news")]),
      evidence([
        evidenceItem(
          "feed-generic-hn",
          "hacker-news",
          [
            ["Points", "800"],
            ["Comments", "300"],
          ],
          {
            eligibleForTopRead: false,
            flags: ["weak_topic_match"],
            decision: "downrank",
          },
        ),
      ]),
      new Map([
        [
          "story:generic-hn",
          cluster({
            id: "generic-hn",
            representativeFeedItemId: "feed-generic-hn",
            providerKeys: ["hacker-news"],
            score: 2.9,
          }),
        ],
      ]),
    );

    expect(result).toEqual([]);
  });

  it("hydrates citationless cross-source stories from eligible cluster evidence", () => {
    const result = selectUniqueTopReadCandidates(
      [
        {
          ...story("tracker", "Anthropic tracker story", "unused", [
            "rss",
            "hacker-news",
          ]),
          citationIds: [],
        },
      ],
      citations([
        citation("c-rss", "feed-rss", "rss"),
        citation("c-hn", "feed-hn", "hacker-news"),
      ]),
      evidence([
        evidenceItem("feed-rss", "rss", []),
        evidenceItem("feed-hn", "hacker-news", [
          ["Points", "42"],
          ["Comments", "17"],
        ]),
      ]),
      new Map([
        [
          "story:tracker",
          cluster({
            id: "tracker",
            representativeFeedItemId: "feed-rss",
            duplicateFeedItemIds: ["feed-hn"],
            providerKeys: ["rss", "hacker-news"],
            score: 2.69,
          }),
        ],
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.providerKeys).toEqual(["rss", "hacker-news"]);
    expect(result[0]?.citationIds).toEqual(["c-rss", "c-hn"]);
  });
});

const story = (
  id: string,
  title: string,
  citationId: string,
  providerKeys: readonly string[],
): TopReadCandidate => ({
  storyClusterId: `story:${id}`,
  title,
  summary: `${title} is worth reading.`,
  interestIds: ["ai-developer-tools"],
  providerKeys,
  citationIds: [citationId],
});

const citation = (
  citationId: string,
  feedItemId: string,
  providerKey: string,
): ReaderSummaryCitation => ({
  citationId,
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  providerKey,
  field: "title",
  canonicalUrl: `https://example.test/${feedItemId}`,
});

const citations = (
  values: readonly ReaderSummaryCitation[],
): ReadonlyMap<string, ReaderSummaryCitation> =>
  new Map(values.map((item) => [item.citationId, item] as const));

const evidence = (
  values: readonly SummaryEvidenceItem[],
): ReadonlyMap<string, SummaryEvidenceItem> =>
  new Map(values.map((item) => [item.feedItemId, item] as const));

const clusters = (ids: readonly string[]): ReadonlyMap<string, StoryCluster> =>
  new Map(
    ids.map((id) => {
      const cluster = {
        id: `story:${id}`,
        storyKey: `story-key:${id}`,
        representativeFeedItemId: `feed-${id}`,
        duplicateFeedItemIds: [],
        interestIds: ["ai-developer-tools"],
        providerKeys: ["x-twitter"],
        score: 2.4,
        observedAtRange: {
          startedAt: new Date("2026-06-29T00:00:00.000Z"),
          endedAt: new Date("2026-06-29T01:00:00.000Z"),
        },
        whyImportant: [`Story ${id} is active.`],
      } satisfies StoryCluster;

      return [cluster.id, cluster] as const;
    }),
  );

const cluster = (params: {
  readonly id: string;
  readonly representativeFeedItemId: string;
  readonly duplicateFeedItemIds?: readonly string[];
  readonly providerKeys: readonly string[];
  readonly score: number;
  readonly signalBreakdown?: StoryCluster["signalBreakdown"];
}): StoryCluster => ({
  id: `story:${params.id}`,
  storyKey: `story-key:${params.id}`,
  representativeFeedItemId: params.representativeFeedItemId,
  duplicateFeedItemIds: params.duplicateFeedItemIds ?? [],
  interestIds: ["ai-developer-tools"],
  providerKeys: params.providerKeys,
  score: params.score,
  signalBreakdown: params.signalBreakdown,
  observedAtRange: {
    startedAt: new Date("2026-06-29T00:00:00.000Z"),
    endedAt: new Date("2026-06-29T01:00:00.000Z"),
  },
  whyImportant: [`Story ${params.id} is active.`],
});

const evidenceItem = (
  feedItemId: string,
  providerKey: string,
  metrics: readonly (readonly [string, string])[],
  quality?: Partial<NonNullable<SummaryEvidenceItem["contentQuality"]>>,
): SummaryEvidenceItem => ({
  feedItemId,
  sourceItemId: `source-${feedItemId}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "ai-developer-tools",
  providerKey,
  providerName: providerKey,
  canonicalUrl: `https://example.test/${feedItemId}`,
  title: feedItemId,
  publishedAt: new Date("2026-06-29T00:00:00.000Z"),
  observedAt: new Date("2026-06-29T00:05:00.000Z"),
  score: 2.4,
  whyImportant: ["Strong source engagement signal"],
  providerMetricLabels: metrics.map(([label, value]) => ({ label, value })),
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Test quality signal",
    ...quality,
  },
});

const providerCounts = (
  values: readonly TopReadCandidate[],
): Record<string, number> =>
  values.reduce<Record<string, number>>((counts, item) => {
    const providerKey = item.providerKeys[0] ?? "unknown";
    counts[providerKey] = (counts[providerKey] ?? 0) + 1;

    return counts;
  }, {});
