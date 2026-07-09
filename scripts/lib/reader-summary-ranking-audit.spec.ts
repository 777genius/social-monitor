import {
  type RankingAuditTopRead,
  materialSameProviderMissedCandidates,
  severeSameProviderMissedCandidates,
} from "./reader-summary-ranking-audit";

describe("reader summary ranking audit", () => {
  it("flags a severe same-provider miss when a stronger item is unexplained", () => {
    const topReads = [
      item({
        title: "Weak general infrastructure post",
        providerKey: "hacker-news",
        signalScore: 1,
      }),
    ];
    const selectedPosts = [
      ...topReads,
      item({
        title: "Much stronger infrastructure post",
        providerKey: "hacker-news",
        signalScore: 1.7,
      }),
    ];

    const misses = materialSameProviderMissedCandidates({
      topReads,
      selectedPosts,
    });

    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({
      providerKey: "hacker-news",
      selectedPostRank: 2,
      signalDelta: 0.7,
      explanation: "unexplained",
    });
    expect(severeSameProviderMissedCandidates(misses)).toHaveLength(1);
  });

  it("keeps stronger candidates non-severe when a core-topic tradeoff explains it", () => {
    const topReads = [
      item({
        title: "Claude Code MCP agent workflow",
        reason: "Claude Code and model context protocol developer tools",
        providerKey: "reddit",
        signalScore: 1,
      }),
    ];
    const selectedPosts = [
      ...topReads,
      item({
        title: "Higher engagement generic governance post",
        providerKey: "reddit",
        signalScore: 1.7,
      }),
    ];

    const misses = materialSameProviderMissedCandidates({
      topReads,
      selectedPosts,
    });

    expect(misses).toHaveLength(1);
    expect(misses[0]?.explanation).toBe("topic_tradeoff");
    expect(severeSameProviderMissedCandidates(misses)).toHaveLength(0);
  });

  it("does not compare candidates from providers missing in top reads", () => {
    const misses = materialSameProviderMissedCandidates({
      topReads: [
        item({
          title: "Hacker News item",
          providerKey: "hacker-news",
          signalScore: 1,
        }),
      ],
      selectedPosts: [
        item({
          title: "Reddit item with stronger signal",
          providerKey: "reddit",
          signalScore: 2,
        }),
      ],
    });

    expect(misses).toHaveLength(0);
  });

  it("treats canonical URLs as the same top read regardless of casing", () => {
    const topReads = [
      item({
        title: "Original X post",
        providerKey: "x-twitter",
        canonicalUrl: "HTTPS://X.COM/A/STATUS/1",
        signalScore: 1,
      }),
    ];
    const selectedPosts = [
      item({
        title: "Original X post",
        providerKey: "x-twitter",
        canonicalUrl: "https://x.com/a/status/1",
        signalScore: 2,
      }),
    ];

    expect(
      materialSameProviderMissedCandidates({ topReads, selectedPosts }),
    ).toHaveLength(0);
  });
});

function item(
  overrides: Partial<RankingAuditTopRead> & {
    readonly title: string;
    readonly providerKey: string;
    readonly signalScore: number;
  },
): RankingAuditTopRead {
  return {
    confidence: { level: "medium" },
    confirmedProviderKeys: [overrides.providerKey],
    citationIds: [],
    ...overrides,
  };
}
