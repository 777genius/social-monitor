import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { UserRelevanceProfile } from "../entities/user-relevance-profile";
import { RankingPolicy, type RankingCandidate } from "./ranking-policy";

describe("RankingPolicy", () => {
  it("ranks candidates from normalized source signal without provider-native metadata", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const profile = UserRelevanceProfile.create({
      id: "profile-ranking-policy",
      tenantId: tenantId("tenant-ranking-policy"),
      workspaceId: workspaceId("workspace-ranking-policy"),
      userId: "user-ranking-policy",
      interestWeights: [{ key: "topic-ai", weight: 1 }],
      sourceWeights: [{ key: "reddit", weight: 0.5 }],
      keywordWeights: [{ key: "agents", weight: 1 }],
      mutedKeywords: [],
      blockedProviderKeys: [],
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-low-signal",
          providerKey: "hacker-news",
          title: "Routine frontend release",
          sourceSignalScore: 0.05,
        }),
        candidate({
          id: "candidate-high-signal",
          providerKey: "reddit",
          title: "AI agents reliability playbook",
          sourceSignalScore: 0.8,
        }),
      ],
      profile,
      generatedAt,
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id)).toEqual([
      "candidate-high-signal",
      "candidate-low-signal",
    ]);
    expect(result[0]?.whyImportant).toEqual(
      expect.arrayContaining([
        "Matches a preferred interest",
        "Comes from a preferred source",
        "Strong source engagement signal",
      ]),
    );
  });

  it("clusters similar candidates and keeps duplicate ids out of the winner", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-a",
          title: "Kubernetes autoscaling reliability improves in release",
          canonicalUrl: "https://example.com/a?ref=one",
          sourceSignalScore: 0.2,
        }),
        candidate({
          id: "candidate-b",
          title: "Kubernetes release improves autoscaling reliability",
          canonicalUrl: "https://another.example/b",
          sourceSignalScore: 0.3,
        }),
      ],
      profile: null,
      generatedAt,
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        candidate: expect.objectContaining({ id: "candidate-b" }),
        clusterSize: 2,
        duplicateCandidateIds: ["candidate-a"],
      }),
    );
  });

  it("keeps Hacker News items with different ids even when their titles match", () => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "hn-1",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
          title: "AI agents reliability release",
        }),
        candidate({
          id: "hn-2",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=2",
          title: "AI agents reliability release",
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id).sort()).toEqual(["hn-1", "hn-2"]);
    expect(result.every((item) => item.clusterSize === 1)).toBe(true);
  });

  it("keeps repeated Hacker News id order as part of item identity", () => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "hn-first",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=1&id=2",
          title: "AI agents reliability release",
          sourceSignalScore: 0.3,
        }),
        candidate({
          id: "hn-first-tracked",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?utm_source=digest&id=1&id=2#comments",
          title: "AI agents reliability release",
          sourceSignalScore: 0.1,
        }),
        candidate({
          id: "hn-second",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=2&id=1",
          title: "AI agents reliability release",
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result).toHaveLength(2);
    expect(result.find((item) => item.candidate.id === "hn-first")).toEqual(
      expect.objectContaining({
        clusterSize: 2,
        duplicateCandidateIds: ["hn-first-tracked"],
      }),
    );
    expect(result.find((item) => item.candidate.id === "hn-second")?.clusterSize).toBe(1);
  });

  it("does not join distinct Hacker News ids through a cross-source title match", () => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "other-source",
          canonicalUrl: "https://journal.example/agent-reliability",
          title: "AI agents reliability release",
          sourceSignalScore: 0.5,
        }),
        candidate({
          id: "hn-1",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
          title: "AI agents reliability release",
          sourceSignalScore: 0.2,
        }),
        candidate({
          id: "hn-2",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=2",
          title: "AI agents reliability release",
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result).toHaveLength(2);
    expect(result.find((item) => item.candidate.id === "other-source")).toEqual(
      expect.objectContaining({
        clusterSize: 2,
        duplicateCandidateIds: ["hn-1"],
      }),
    );
    expect(result.find((item) => item.candidate.id === "hn-2")?.clusterSize).toBe(1);
  });

  it("clusters the same Hacker News item across tracking and fragment variants", () => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "hn-original",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
          title: "First report on agent reliability",
          sourceSignalScore: 0.3,
        }),
        candidate({
          id: "hn-tracked",
          providerKey: "hacker-news",
          canonicalUrl: "https://NEWS.YCOMBINATOR.COM/item/?utm_source=digest&id=1&ref=front#comments",
          title: "Discussion of the reliability report",
          sourceSignalScore: 0.1,
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      candidate: expect.objectContaining({ id: "hn-original" }),
      clusterSize: 2,
      duplicateCandidateIds: ["hn-tracked"],
    }));
  });

  it("preserves other query-identified resources while ignoring tracking and credentials", () => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "article-1",
          canonicalUrl: "https://journal.example/article?edition=1&lang=en",
          title: "Agent reliability analysis",
          sourceSignalScore: 0.3,
        }),
        candidate({
          id: "article-1-tracked",
          canonicalUrl: "https://JOURNAL.example/article/?lang=en&utm_campaign=weekly&edition=1&access_token=fixture#top",
          title: "Reliability analysis from the journal",
          sourceSignalScore: 0.1,
        }),
        candidate({
          id: "article-2",
          canonicalUrl: "https://journal.example/article?edition=2&lang=en",
          title: "Agent reliability analysis",
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id).sort()).toEqual(["article-1", "article-2"]);
    expect(result.find((item) => item.candidate.id === "article-1")).toEqual(
      expect.objectContaining({
        clusterSize: 2,
        duplicateCandidateIds: ["article-1-tracked"],
      }),
    );
    expect(result.map((item) => item.clusterId).join(" ")).not.toContain("fixture");
  });

  it.each([
    ["x.com", "https://x.com/author/status/123", "s=20"],
    ["twitter.com", "https://twitter.com/author/status/123", "s=20"],
    ["youtube.com", "https://www.youtube.com/watch?v=alpha", "si=fixture-share"],
    ["youtu.be", "https://youtu.be/alpha", "si=fixture-share"],
  ])("clusters %s share links with their original item", (_host, originalUrl, shareQuery) => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "original",
          canonicalUrl: originalUrl,
          title: "First report on agent reliability",
          sourceSignalScore: 0.3,
        }),
        candidate({
          id: "shared",
          canonicalUrl: `${originalUrl}${originalUrl.includes("?") ? "&" : "?"}${shareQuery}`,
          title: "Discussion of the reliability report",
          sourceSignalScore: 0.1,
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      candidate: expect.objectContaining({ id: "original" }),
      clusterSize: 2,
      duplicateCandidateIds: ["shared"],
    }));
  });

  it('shares X ref_src and YouTube short-link identity with story grouping', () => {
    for (const originalUrl of ['https://x.com/author/status/123', 'https://youtu.be/alpha']) {
      const shareQuery = originalUrl.includes('x.com') ? 'ref_src=twsrc%5Etfw' : 'si=share';
      const result = new RankingPolicy().rank({
        candidates: [
          candidate({ id: 'original', canonicalUrl: originalUrl, title: 'Agent reliability analysis' }),
          candidate({ id: 'shared', canonicalUrl: `${originalUrl}?${shareQuery}&access_token=synthetic-marker-only`,
            title: 'Agent reliability analysis' }),
        ], profile: null, generatedAt: new Date('2026-06-22T10:00:00.000Z'), limit: 1,
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.clusterSize).toBe(2);
      expect(JSON.stringify(result.map((item) => item.clusterId))).not.toContain('synthetic-marker-only');
    }
  });

  it.each(["s", "si"])("keeps %s query identity on unrelated hosts", (queryKey) => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "original",
          canonicalUrl: "https://journal.example/article",
          title: "Agent reliability analysis",
        }),
        candidate({
          id: "queried",
          canonicalUrl: `https://journal.example/article?${queryKey}=other`,
          title: "Agent reliability analysis",
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id).sort()).toEqual(["original", "queried"]);
  });

  it("keeps different YouTube video ids separate despite the same title", () => {
    const result = new RankingPolicy().rank({
      candidates: [
        candidate({
          id: "video-alpha",
          canonicalUrl: "https://www.youtube.com/watch?v=alpha&si=fixture-share",
          title: "Agent reliability analysis",
        }),
        candidate({
          id: "video-beta",
          canonicalUrl: "https://www.youtube.com/watch?v=beta",
          title: "Agent reliability analysis",
        }),
      ],
      profile: null,
      generatedAt: new Date("2026-06-22T10:00:00.000Z"),
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id).sort()).toEqual(["video-alpha", "video-beta"]);
  });

  it("applies memory guidance without requiring a persisted profile", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-github",
          providerKey: "github",
          title: "Agent runtime release with orchestration benchmarks",
          sourceSignalScore: 0.1,
        }),
        candidate({
          id: "candidate-reddit",
          providerKey: "reddit",
          title: "Agent workflow discussion",
          sourceSignalScore: 0.2,
        }),
        candidate({
          id: "candidate-rss",
          providerKey: "rss",
          title: "Low quality agent roundup",
          sourceSignalScore: 0.7,
        }),
      ],
      profile: null,
      memoryGuidance: {
        providerPreferences: [{ key: "github", weight: 1 }],
        keywordPreferences: [{ key: "orchestration", weight: 1 }],
        blockedProviderKeys: ["rss"],
      },
      generatedAt,
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id)).toEqual([
      "candidate-github",
      "candidate-reddit",
    ]);
    expect(result[0]?.whyImportant).toContain("Matches memory preference");
  });

  it("keeps negative memory preferences explainable without hard-filtering the source", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-reddit",
          providerKey: "reddit",
          title: "Agent launch discussion with strong engagement",
          sourceSignalScore: 0.5,
        }),
        candidate({
          id: "candidate-github",
          providerKey: "github",
          title: "Agent runtime release",
          sourceSignalScore: 0.2,
        }),
      ],
      profile: null,
      memoryGuidance: {
        providerPreferences: [{ key: "reddit", weight: -1 }],
      },
      generatedAt,
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id)).toEqual([
      "candidate-github",
      "candidate-reddit",
    ]);
    expect(result[1]?.whyImportant).toContain("Down-ranked by memory preference");
  });

  it("filters weak X posts before high engagement can lift them into summaries", () => {
    const generatedAt = new Date("2026-06-22T10:00:00.000Z");
    const policy = new RankingPolicy();

    const result = policy.rank({
      candidates: [
        candidate({
          id: "candidate-x-promo",
          providerKey: "x-twitter",
          title:
            "I have been watching the AI space on BingX. Drop your top 3 projects.",
          bodyPreview:
            "I have been watching the AI space on BingX. Drop your top 3 projects. #AI #Crypto #Tech",
          authorHandle: "Def_Rambo",
          providerMetadata: {
            kind: "x_post",
            searchQuery: "OpenAI",
            likes: 1000,
            reposts: 400,
            replies: 90,
          },
          sourceSignalScore: 0.85,
        }),
        candidate({
          id: "candidate-x-good",
          providerKey: "x-twitter",
          title:
            "OpenAI published new agent reliability evals for production teams.",
          bodyPreview:
            "The update covers trace scoring, regression checks and deployment failure analysis.",
          authorHandle: "OpenAI",
          providerMetadata: {
            kind: "x_post",
            searchQuery: "OpenAI agents",
            likes: 42,
            reposts: 8,
            replies: 3,
          },
          sourceSignalScore: 0.25,
        }),
      ],
      profile: null,
      generatedAt,
      limit: 10,
    });

    expect(result.map((item) => item.candidate.id)).toEqual([
      "candidate-x-good",
    ]);
    expect(result[0]?.contentQuality.eligibleForTopRead).toBe(true);
  });
});

const candidate = (
  overrides: Partial<RankingCandidate> & Pick<RankingCandidate, "id" | "title">,
): RankingCandidate => ({
  interestId: "topic-ai",
  providerKey: "rss",
  canonicalUrl: `https://example.com/${overrides.id}`,
  bodyPreview: "Fresh source item about AI systems.",
  publishedAt: new Date("2026-06-22T09:45:00.000Z"),
  sourceSignalScore: 0,
  ...overrides,
});
