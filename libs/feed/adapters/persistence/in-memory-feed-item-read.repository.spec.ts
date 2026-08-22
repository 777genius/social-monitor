import {
  tenantId,
  workspaceId,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import { FeedItem } from "../../domain";
import { InMemoryFeedItemReadRepository } from "./in-memory-feed-item-read.repository";

const makeItem = (params: {
  readonly id: string;
  readonly sourceItemId: string;
  readonly tenant?: string;
  readonly interestId?: string;
  readonly providerKey?: string;
  readonly providerMetadata?: JsonObject;
  readonly canonicalUrl: string;
  readonly publishedAt?: Date;
  readonly observedAt?: Date;
}) =>
  FeedItem.publish({
    id: params.id,
    tenantId: tenantId(params.tenant ?? "tenant-1"),
    workspaceId: workspaceId("workspace-1"),
    interestId: params.interestId ?? "topic-1",
    sourceItemId: params.sourceItemId,
    sourceBindingId: "binding-1",
    providerKey: params.providerKey ?? "rss",
    canonicalUrl: params.canonicalUrl,
    title: `Title ${params.id}`,
    bodyPreview: `Body ${params.id}`,
    authorHandle: "author",
    publishedAt: params.publishedAt ?? new Date("2026-06-05T00:00:00.000Z"),
    observedAt: params.observedAt ?? new Date("2026-06-05T00:01:00.000Z"),
    providerMetadata: params.providerMetadata,
  });

describe("InMemoryFeedItemReadRepository", () => {
  it("dedupes feed items by normalized canonical URL inside tenant scope", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "feed-1",
        sourceItemId: "source-1",
        canonicalUrl:
          "https://Example.test/story?utm_source=email&b=2&a=1#comments",
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-2",
        sourceItemId: "source-2",
        canonicalUrl: "https://example.test/story?a=1&b=2",
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-3",
        sourceItemId: "source-3",
        tenant: "tenant-2",
        canonicalUrl: "https://example.test/story?a=1&b=2",
      }),
    );

    await expect(
      repository.list({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
    await expect(
      repository.list({
        tenantId: tenantId("tenant-2"),
        workspaceId: workspaceId("workspace-1"),
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
  });

  it("dedupes canonical URLs inside topic scope but keeps the same URL for another topic", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "topic-1-feed-1",
        sourceItemId: "topic-1-source-1",
        interestId: "topic-1",
        canonicalUrl: "https://example.test/story?utm_source=email&a=1",
      }),
    );
    repository.upsert(
      makeItem({
        id: "topic-1-feed-2",
        sourceItemId: "topic-1-source-2",
        interestId: "topic-1",
        canonicalUrl: "https://example.test/story?a=1",
      }),
    );
    repository.upsert(
      makeItem({
        id: "topic-2-feed-1",
        sourceItemId: "topic-2-source-1",
        interestId: "topic-2",
        canonicalUrl: "https://example.test/story?a=1",
      }),
    );

    await expect(
      repository.list({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        interestId: "topic-1",
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
    await expect(
      repository.list({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        interestId: "topic-2",
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
  });

  it("dedupes enriched articles by semantic fingerprint across different source URLs", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "reddit-feed",
        sourceItemId: "reddit-source",
        providerKey: "reddit",
        canonicalUrl: "https://www.reddit.com/r/OpenAI/comments/demo",
        providerMetadata: {
          articleContent: {
            status: "enriched",
            semanticFingerprint: "feedfacecafebeef",
            contentHash: "content-hash-1",
          },
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "rss-feed",
        sourceItemId: "rss-source",
        providerKey: "rss",
        canonicalUrl: "https://example.test/same-article?utm_source=rss",
        providerMetadata: {
          articleContent: {
            status: "enriched",
            semanticFingerprint: "feedfacecafebeef",
            contentHash: "content-hash-1",
          },
        },
      }),
    );

    const result = await repository.list({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.toSnapshot().id).toBe("reddit-feed");
  });

  it("filters feed items by observation window with an exclusive upper bound", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "feed-before-window",
        sourceItemId: "source-before-window",
        canonicalUrl: "https://example.test/before-window",
        observedAt: new Date("2026-06-22T23:59:59.999Z"),
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-inside-window",
        sourceItemId: "source-inside-window",
        canonicalUrl: "https://example.test/inside-window",
        observedAt: new Date("2026-06-23T00:00:00.000Z"),
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-at-window-end",
        sourceItemId: "source-at-window-end",
        canonicalUrl: "https://example.test/at-window-end",
        observedAt: new Date("2026-06-24T00:00:00.000Z"),
      }),
    );

    const result = await repository.list({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      observedAfter: new Date("2026-06-22T23:59:59.999Z"),
      observedBefore: new Date("2026-06-24T00:00:00.000Z"),
      limit: 10,
    });

    expect(result.items.map((item) => item.toSnapshot().id)).toEqual([
      "feed-inside-window",
    ]);
  });

  it("uses an inclusive observed recovery start without publication filtering", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    for (const [id, observedAt] of [
      ["start", "2026-06-23T00:00:00.000Z"],
      ["inside", "2026-06-23T23:59:59.999Z"],
      ["end", "2026-06-24T00:00:00.000Z"],
    ] as const) {
      repository.upsert(
        makeItem({
          id: `feed-${id}`,
          sourceItemId: `source-${id}`,
          canonicalUrl: `https://example.test/observed-${id}`,
          publishedAt: new Date("2026-06-01T00:00:00.000Z"),
          observedAt: new Date(observedAt),
        }),
      );
    }

    const result = await repository.list({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      observedAtOrAfter: new Date("2026-06-23T00:00:00.000Z"),
      observedBefore: new Date("2026-06-24T00:00:00.000Z"),
      limit: 10,
    });

    expect(result.items.map((item) => item.toSnapshot().id).sort()).toEqual([
      "feed-inside",
      "feed-start",
    ]);
    await expect(
      repository.list({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        observedAfter: new Date("2026-06-22T23:59:59.999Z"),
        observedAtOrAfter: new Date("2026-06-23T00:00:00.000Z"),
        limit: 10,
      }),
    ).rejects.toThrow("cannot mix exclusive and inclusive starts");
  });

  it("filters feed items by publication window with an inclusive start and exclusive end", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "feed-before-window",
        sourceItemId: "source-before-window",
        canonicalUrl: "https://example.test/published-before-window",
        publishedAt: new Date("2026-06-22T23:59:59.999Z"),
        observedAt: new Date("2026-06-23T12:00:00.000Z"),
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-at-window-start",
        sourceItemId: "source-at-window-start",
        canonicalUrl: "https://example.test/published-at-window-start",
        publishedAt: new Date("2026-06-23T00:00:00.000Z"),
        observedAt: new Date("2026-06-23T12:01:00.000Z"),
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-inside-window",
        sourceItemId: "source-inside-window",
        canonicalUrl: "https://example.test/published-inside-window",
        publishedAt: new Date("2026-06-23T10:00:00.000Z"),
        observedAt: new Date("2026-06-23T12:02:00.000Z"),
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-at-window-end",
        sourceItemId: "source-at-window-end",
        canonicalUrl: "https://example.test/published-at-window-end",
        publishedAt: new Date("2026-06-24T00:00:00.000Z"),
        observedAt: new Date("2026-06-23T12:03:00.000Z"),
      }),
    );

    const result = await repository.list({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      publishedAtOrAfter: new Date("2026-06-23T00:00:00.000Z"),
      publishedBefore: new Date("2026-06-24T00:00:00.000Z"),
      limit: 10,
    });

    expect(result.items.map((item) => item.toSnapshot().id)).toEqual([
      "feed-inside-window",
      "feed-at-window-start",
    ]);
  });

  it("filters repository radar items by provider and trend metadata", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "feed-codex",
        sourceItemId: "source-codex",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/openai/codex",
        providerMetadata: {
          kind: "github_repository_trend",
          repository: {
            fullName: "openai/codex",
            url: "https://github.com/openai/codex",
            language: "TypeScript",
            topics: ["ai", "agents"],
          },
          trend: {
            primaryWindow: "24h",
          },
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-rust",
        sourceItemId: "source-rust",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/astral-sh/uv",
        providerMetadata: {
          kind: "github_repository_trend",
          repository: {
            fullName: "astral-sh/uv",
            url: "https://github.com/astral-sh/uv",
            language: "Rust",
            topics: ["python"],
          },
          trend: {
            primaryWindow: "7d",
          },
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-reddit",
        sourceItemId: "source-reddit",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/comments/demo",
      }),
    );

    const result = await repository.list({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      providerKey: "github-repo-radar",
      repositoryTrendWindow: "24h",
      repositoryLanguage: "typescript",
      repositoryTopic: "Agents",
      limit: 10,
    });

    expect(result.items.map((item) => item.toSnapshot().id)).toEqual([
      "feed-codex",
    ]);
  });

  it("filters repository radar items by long trend windows", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "feed-codex",
        sourceItemId: "source-codex",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/openai/codex",
        providerMetadata: {
          kind: "github_repository_trend",
          repository: {
            fullName: "openai/codex",
            url: "https://github.com/openai/codex",
            language: "TypeScript",
            topics: ["ai", "agents"],
          },
          trend: {
            primaryWindow: "24h",
          },
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-uv",
        sourceItemId: "source-uv",
        providerKey: "github-repo-radar",
        canonicalUrl: "https://github.com/astral-sh/uv",
        providerMetadata: {
          kind: "github_repository_trend",
          repository: {
            fullName: "astral-sh/uv",
            url: "https://github.com/astral-sh/uv",
            language: "Rust",
            topics: ["python"],
          },
          trend: {
            primaryWindow: "7d",
          },
        },
      }),
    );

    const result = await repository.list({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      providerKey: "github-repo-radar",
      repositoryTrendWindow: "7d",
      limit: 10,
    });

    expect(result.items.map((item) => item.toSnapshot().id)).toEqual([
      "feed-uv",
    ]);
  });

  it("lists lightweight signal baseline samples scoped by topic and observed window", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "feed-reddit",
        sourceItemId: "source-reddit",
        interestId: "topic-1",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/r/startups/comments/demo",
        providerMetadata: {
          subreddit: "startups",
          score: 55,
          numComments: 18,
          upvoteRatio: 0.91,
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-other-topic",
        sourceItemId: "source-other-topic",
        interestId: "topic-2",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/r/startups/comments/other",
        providerMetadata: {
          subreddit: "startups",
          score: 10,
          numComments: 1,
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-rss",
        sourceItemId: "source-rss",
        interestId: "topic-1",
        providerKey: "rss",
        canonicalUrl: "https://example.test/rss",
      }),
    );

    const samples = await repository.listSamples({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      observedAfter: new Date("2026-06-04T00:00:00.000Z"),
      limit: 10,
    });

    expect(samples).toEqual([
      {
        feedItemId: "feed-reddit",
        interestId: "topic-1",
        providerKey: "reddit",
        sourceKey: "r/startups",
        contentType: "post",
        strength: expect.any(Number),
        publishedAt: new Date("2026-06-05T00:00:00.000Z"),
        observedAt: new Date("2026-06-05T00:01:00.000Z"),
      },
    ]);
  });

  it("filters lightweight baseline samples by exact cohort and orders them by observation time", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(
      makeItem({
        id: "feed-startups-old-published",
        sourceItemId: "source-startups-old-published",
        interestId: "topic-1",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/r/startups/comments/old-published",
        publishedAt: new Date("2026-06-01T00:00:00.000Z"),
        observedAt: new Date("2026-06-05T00:03:00.000Z"),
        providerMetadata: {
          subreddit: "startups",
          score: 55,
          numComments: 18,
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-startups-newer-published",
        sourceItemId: "source-startups-newer-published",
        interestId: "topic-1",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/r/startups/comments/newer-published",
        publishedAt: new Date("2026-06-05T00:00:00.000Z"),
        observedAt: new Date("2026-06-05T00:02:00.000Z"),
        providerMetadata: {
          subreddit: "startups",
          score: 35,
          numComments: 8,
        },
      }),
    );
    repository.upsert(
      makeItem({
        id: "feed-programming",
        sourceItemId: "source-programming",
        interestId: "topic-1",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/r/programming/comments/demo",
        observedAt: new Date("2026-06-05T00:04:00.000Z"),
        providerMetadata: {
          subreddit: "programming",
          score: 120,
          numComments: 30,
        },
      }),
    );

    const samples = await repository.listSamples({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      observedAfter: new Date("2026-06-04T00:00:00.000Z"),
      limit: 10,
      cohortFilters: [
        {
          providerKey: "reddit",
          sourceKey: "r/startups",
          contentType: "post",
        },
      ],
    });

    expect(samples.map((sample) => sample.feedItemId)).toEqual([
      "feed-startups-old-published",
      "feed-startups-newer-published",
    ]);
  });

  describe("promotion snapshot repository conformance", () => {
    it("uses timestamp/id keysets and applies workspace and interest filters", async () => {
      const repository = new InMemoryFeedItemReadRepository();
      for (const [id, interestId, publishedAt, observedAt] of [
        ["tie-b", "topic-1", "2026-06-23T12:00:00.000Z", "2026-06-23T12:02:00.000Z"],
        ["tie-a", "topic-1", "2026-06-23T12:00:00.000Z", "2026-06-23T12:03:00.000Z"],
        ["other-interest", "topic-2", "2026-06-23T13:00:00.000Z", "2026-06-23T12:01:00.000Z"],
      ] as const) {
        repository.upsert(makeItem({
          id,
          sourceItemId: `source-${id}`,
          interestId,
          providerKey: "reddit",
          canonicalUrl: `https://reddit.test/${id}`,
          publishedAt: new Date(publishedAt),
          observedAt: new Date(observedAt),
          providerMetadata: { kind: "reddit_post", score: 1 },
        }));
      }
      const base = {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        windowStartedAt: new Date("2026-06-23T00:00:00.000Z"),
        windowEndedAt: new Date("2026-06-24T00:00:00.000Z"),
        observedThrough: new Date("2026-06-24T00:00:00.000Z"),
      };

      const published = await repository.readPromotionSnapshot({
        ...base, interestId: "topic-1", timestampPolicy: "published_at",
      });
      const observed = await repository.readPromotionSnapshot({
        ...base, timestampPolicy: "observed_at",
      });

      expect(published.ok && published.candidates.map(({ item }) =>
        item.toSnapshot().id)).toEqual(["tie-b", "tie-a"]);
      expect(observed.ok && observed.candidates.map(({ item }) =>
        item.toSnapshot().id)).toEqual(["tie-a", "tie-b", "other-interest"]);
    });

    it("copies its immutable input snapshot before the promise is observed", async () => {
      const repository = new InMemoryFeedItemReadRepository();
      repository.upsert(makeItem({
        id: "before",
        sourceItemId: "source-before",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.test/before",
        publishedAt: new Date("2026-06-23T12:00:00.000Z"),
        observedAt: new Date("2026-06-23T12:00:00.000Z"),
        providerMetadata: { kind: "reddit_post", score: 7 },
      }));
      const pending = repository.readPromotionSnapshot({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        timestampPolicy: "published_at",
        windowStartedAt: new Date("2026-06-23T00:00:00.000Z"),
        windowEndedAt: new Date("2026-06-24T00:00:00.000Z"),
        observedThrough: new Date("2026-06-24T00:00:00.000Z"),
      });
      repository.upsert(makeItem({
        id: "concurrent",
        sourceItemId: "source-concurrent",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.test/concurrent",
        publishedAt: new Date("2026-06-23T13:00:00.000Z"),
        observedAt: new Date("2026-06-23T13:00:00.000Z"),
        providerMetadata: { kind: "reddit_post", score: 99 },
      }));

      const result = await pending;
      expect(result.ok && result.candidates.map(({ item }) =>
        item.toSnapshot().id)).toEqual(["before"]);
    });

    it.each(["published_at", "observed_at"] as const)(
      "applies exact millisecond-visible [start,end) and inclusive cutoff for %s",
      async (timestampPolicy) => {
        const repository = new InMemoryFeedItemReadRepository();
        for (const [id, observedAt] of [
          ["below", "2026-06-23T11:59:59.999Z"],
          ["exact", "2026-06-23T12:00:00.000Z"],
          ["above", "2026-06-23T12:00:00.001Z"],
        ] as const) {
          repository.upsert(makeItem({
            id,
            sourceItemId: `source-${id}`,
            providerKey: "reddit",
            canonicalUrl: `https://reddit.test/${id}`,
            publishedAt: new Date("2026-06-23T10:00:00.000Z"),
            observedAt: new Date(observedAt),
            providerMetadata: { kind: "reddit_post", score: 20 },
          }));
        }
        const result = await repository.readPromotionSnapshot({
          tenantId: tenantId("tenant-1"),
          workspaceId: workspaceId("workspace-1"),
          timestampPolicy,
          windowStartedAt: new Date("2026-06-23T00:00:00.000Z"),
          windowEndedAt: new Date("2026-06-24T00:00:00.000Z"),
          observedThrough: new Date("2026-06-23T12:00:00.000Z"),
        });
        expect(result.ok && result.candidates.map(({ item }) =>
          item.toSnapshot().id).sort()).toEqual(["below", "exact"]);
      },
    );

    it("fails closed when canonical eligibility exceeds 1,000", async () => {
      const repository = new InMemoryFeedItemReadRepository();
      for (let index = 0; index < 1_001; index += 1) {
        repository.upsert(makeItem({
          id: `eligible-${index}`,
          sourceItemId: `source-eligible-${index}`,
          providerKey: "reddit",
          canonicalUrl: `https://reddit.test/eligible/${index}`,
          publishedAt: new Date(1_771_843_200_000 + index),
          observedAt: new Date(1_771_843_200_000 + index),
          providerMetadata: { kind: "reddit_post", score: index },
        }));
      }
      await expect(repository.readPromotionSnapshot({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        timestampPolicy: "published_at",
        windowStartedAt: new Date(1_771_843_199_999),
        windowEndedAt: new Date(1_771_843_202_000),
        observedThrough: new Date(1_771_843_202_000),
      })).resolves.toMatchObject({
        ok: false,
        reason: "eligible_item_ceiling_exceeded",
        eligibleItemCount: 1_001,
        physicalRowsRead: 1_001,
      });
    });
  });

});
