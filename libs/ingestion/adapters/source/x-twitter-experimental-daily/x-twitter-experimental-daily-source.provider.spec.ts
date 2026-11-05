import { Metadata, status } from "@grpc/grpc-js";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { XTwitterSourceProvider } from "./x-twitter-experimental-daily-source.provider";
import type {
  XDailyCollectorClientPort,
  XDailyCollectorRequest,
} from "./x-daily-collector-client.port";

describe("XTwitterSourceProvider", () => {
  it("declares that daily snapshot scans do not support cursor resume", () => {
    const provider = new XTwitterSourceProvider(new RecordingCollector(), {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(provider.capabilityProfile()).toMatchObject({
      providerKey: "x-twitter",
      cursorModel: "none",
    });
  });

  it("plans and scans through the collector client without leaking gRPC details", async () => {
    const collector = new RecordingCollector();
    const provider = new XTwitterSourceProvider(collector, {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        language: "en",
        windowHours: 48,
        searchProducts: ["top", "latest"],
        limitPerProduct: 10,
        minLikes: 20,
      },
    };

    const plan = provider.planScan(
      {
        mode: "search",
        query: "ai agents",
      },
      context,
    );
    const result = await provider.scan(plan, context);

    expect(collector.requests).toEqual([
      expect.objectContaining({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        query: "ai agents",
        language: "en",
        windowHours: 48,
        windowEnd: new Date("2026-06-27T00:00:00.000Z"),
        searchProducts: ["top", "latest"],
        limitPerProduct: 10,
        minLikes: 20,
        maxItems: 25,
      }),
    ]);
    expect(result).toMatchObject({
      nextCursor: "cursor-1",
      warnings: ["partial: one page skipped"],
      items: [
        {
          externalId: "x-twitter:123",
          canonicalUrl: "https://x.com/a/status/123",
          authorHandle: "a",
          metadata: expect.objectContaining({
            kind: "x_post",
            provider: "x-twitter",
            tweetId: "123",
            searchQuery: "ai agents",
            sourceQueryLane: {
              providerKey: "x-twitter",
              mode: "search",
              query: "ai agents",
              maxItems: 25,
            },
            likes: 100,
            retweets: 10,
            replies: 4,
            publicMetrics: expect.objectContaining({
              like_count: 100,
              retweet_count: 10,
              reply_count: 4,
            }),
          }),
        },
      ],
    });
    expect(hasUndefinedValue(result.items[0]?.metadata)).toBe(false);
    expect(result.items[0]?.metadata).not.toHaveProperty("quotes");
    expect(result.items[0]?.metadata).not.toHaveProperty("impressions");
  });

  it("applies metric floors after collector results are returned", async () => {
    const provider = new XTwitterSourceProvider(new RecordingCollector(), {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        minLikes: 20,
        minReplies: 3,
      },
    };

    const result = await provider.scan(
      provider.planScan({ mode: "search", query: "claude code" }, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "x-twitter:123",
    ]);
  });

  it("rejects viral posts without meaningful query overlap when enabled", async () => {
    const collector = {
      collectDailySearch: async () => ({
        posts: [
          xPost({
            tweetId: "relevant",
            text: "Rust agent runtime release",
            likes: 30,
            trendScore: 30,
          }),
          xPost({
            tweetId: "viral-off-topic",
            text: "Adventure cat is ready to go swimming",
            likes: 10_000,
            trendScore: 10_000,
          }),
        ],
        warnings: [],
      }),
    } satisfies XDailyCollectorClientPort;
    const provider = new XTwitterSourceProvider(collector, {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        minLikes: 0,
        requireQueryMatch: true,
      },
    };

    const result = await provider.scan(
      provider.planScan(
        {
          mode: "search",
          query: 'Rust OR Golang OR "Go programming"',
        },
        context,
      ),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "x-twitter:relevant",
    ]);
  });

  it("scans configured search queries separately and deduplicates posts", async () => {
    const collector = new MultiQueryCollector();
    const provider = new XTwitterSourceProvider(collector, {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        maxItems: 2,
        searchQueries: ["mcp server", "cursor ai", "claude code"],
      },
    };

    const plan = provider.planScan(
      {
        mode: "search",
        query: "ai agents",
      },
      context,
    );
    const result = await provider.scan(
      {
        ...plan,
        cursor: JSON.stringify({
          queries: {
            "cursor ai": "cursor-before",
          },
        }),
      },
      context,
    );

    expect(collector.requests.map((request) => request.query)).toEqual([
      "ai agents",
      "mcp server",
      "cursor ai",
      "claude code",
    ]);
    expect(collector.requests.map((request) => request.maxItems)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(
      collector.requests.find((request) => request.query === "cursor ai")
        ?.cursor,
    ).toBe("cursor-before");
    expect(result.items.map((item) => item.externalId)).toEqual([
      "x-twitter:cursor",
      "x-twitter:shared",
    ]);
    expect(result.items[1]?.metadata).toMatchObject({
      searchQuery: "mcp server",
      sourceQueryLane: {
        providerKey: "x-twitter",
        mode: "search",
        query: "mcp server",
        maxItems: 1,
      },
      likes: 90,
    });
    expect(result.nextCursor).toBe(
      JSON.stringify({
        queries: {
          "ai agents": "next-ai-agents",
          "mcp server": "next-mcp-server",
          "cursor ai": "next-cursor-ai",
          "claude code": "next-claude-code",
        },
      }),
    );
  });

  it("allows config to raise the per-query lane budget explicitly", async () => {
    const collector = new MultiQueryCollector();
    const provider = new XTwitterSourceProvider(collector, {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        maxItems: 2,
        maxItemsPerQuery: 5,
        searchQueries: ["mcp server"],
      },
    };

    await provider.scan(
      provider.planScan({ mode: "search", query: "ai agents" }, context),
      context,
    );

    expect(collector.requests.map((request) => request.maxItems)).toEqual([
      5, 5,
    ]);
  });

  it("uses bounded adaptive expansion to ask the collector for deeper query results", async () => {
    const collector = new MultiQueryCollector();
    const provider = new XTwitterSourceProvider(collector, {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        maxItems: 20,
        maxItemsPerQuery: 3,
        limitPerProduct: 3,
        searchQueries: ["mcp server"],
        adaptivePagination: {
          enabled: true,
          targetItems: 12,
          maxPages: 2,
          minNewItemsPerPage: 1,
          maxDuplicateRate: 0.9,
        },
      },
    };

    await provider.scan(
      provider.planScan({ mode: "search", query: "ai agents" }, context),
      context,
    );

    expect(collector.requests.map((request) => request.maxItems)).toEqual([
      3, 6, 3, 6,
    ]);
    expect(
      collector.requests.map((request) => request.limitPerProduct),
    ).toEqual([3, 6, 3, 6]);
  });

  it("uses per-query budgets when source query planner compiled lane budgets", async () => {
    const collector = new MultiQueryCollector();
    const provider = new XTwitterSourceProvider(collector, {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        maxItems: 30,
        searchQueries: ["mcp server", "cursor ai"],
        searchQueryBudgets: [
          { query: "ai agents", maxItems: 12 },
          { query: "mcp server", maxItems: 6 },
        ],
      },
    };

    await provider.scan(
      provider.planScan({ mode: "search", query: "ai agents" }, context),
      context,
    );

    expect(collector.requests.map((request) => request.query)).toEqual([
      "ai agents",
      "mcp server",
      "cursor ai",
    ]);
    expect(collector.requests.map((request) => request.maxItems)).toEqual([
      12, 6, 10,
    ]);
    expect(
      collector.requests.map((request) => request.limitPerProduct),
    ).toEqual([12, 6, 10]);
  });

  it.each([
    [status.RESOURCE_EXHAUSTED, "x-twitter.partial_rate_limit"],
    [status.UNAVAILABLE, "x-twitter.partial_provider_failure"],
    [status.DEADLINE_EXCEEDED, "x-twitter.partial_provider_failure"],
  ] as const)("retains posts and query cursors after retryable gRPC %s", async (code, warningCode) => {
    const collector = new FailingSecondQueryCollector(errorWithCode(code));
    const provider = new XTwitterSourceProvider(
      collector,
      {
        now: () => new Date("2026-06-27T00:00:00.000Z"),
      },
    );
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: {
        searchQueries: ["mcp server", "cursor ai"],
      },
    };

    const result = await provider.scan(
      {
        ...provider.planScan({ mode: "search", query: "ai agents" }, context),
        cursor: JSON.stringify({
          queries: {
            "mcp server": "previous-mcp-cursor",
            "cursor ai": "previous-cursor-ai-cursor",
          },
        }),
      },
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "x-twitter:ai-agents",
    ]);
    expect(result.warnings).toEqual([
      `mcp server: ${warningCode}: grpc ${code}`,
    ]);
    expect(result.nextCursor).toBe(
      JSON.stringify({
        queries: {
          "ai agents": "next-ai-cursor",
          "mcp server": "previous-mcp-cursor",
          "cursor ai": "previous-cursor-ai-cursor",
        },
      }),
    );
    expect(collector.requests.map((request) => request.query)).toEqual([
      "ai agents",
      "mcp server",
    ]);
  });

  it.each([
    [status.UNAVAILABLE, false, 0],
    [status.DEADLINE_EXCEEDED, false, 0],
    [status.RESOURCE_EXHAUSTED, false, 0],
    [status.UNAVAILABLE, true, 30],
    [status.UNAUTHENTICATED, true, 0],
    [status.PERMISSION_DENIED, true, 0],
    [status.INVALID_ARGUMENT, true, 0],
    [status.INTERNAL, true, 0],
  ] as const)("propagates gRPC %s with posts=%s and minLikes=%s when partial recovery is unsafe", async (code, includePosts, minLikes) => {
    const failure = errorWithCode(code);
    const provider = new XTwitterSourceProvider(
      new FailingSecondQueryCollector(failure, includePosts),
      { now: () => new Date("2026-06-27T00:00:00.000Z") },
    );
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "binding-1",
      scanJobId: "scan-1",
      correlationId: "corr-1",
      config: { searchQueries: ["mcp server"], minLikes },
    };

    await expect(provider.scan(
      provider.planScan({ mode: "search", query: "ai agents" }, context),
      context,
    )).rejects.toBe(failure);
  });

  it("keeps invalid bindings non-retryable through validation", () => {
    const provider = new XTwitterSourceProvider(new RecordingCollector(), {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(provider.validateBinding({ mode: "listing", query: "ai" })).toEqual({
      ok: false,
      reason: "Unsupported query mode: listing",
    });
    expect(provider.validateBinding({ mode: "search", query: "a" })).toEqual({
      ok: false,
      reason: "X/Twitter search query must be 2-500 characters",
    });
  });

  it("classifies gRPC status codes into source provider failures", () => {
    const provider = new XTwitterSourceProvider(new RecordingCollector(), {
      now: () => new Date("2026-06-27T00:00:00.000Z"),
    });

    expect(
      provider.classifyError(errorWithCode(status.RESOURCE_EXHAUSTED)),
    ).toMatchObject({
      kind: "rate_limited",
      retryable: true,
    });
    expect(
      provider.classifyError(
        errorWithCode(status.RESOURCE_EXHAUSTED, {
          "retry-after-ms": "900000",
          "rate-limit-reset-at": "2026-06-27T12:15:00.000Z",
        }),
      ),
    ).toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 900_000,
      rateLimitResetAt: new Date("2026-06-27T12:15:00.000Z"),
    });
    expect(
      provider.classifyError(errorWithCode(status.UNAUTHENTICATED)),
    ).toMatchObject({
      kind: "auth_failed",
      retryable: false,
    });
    expect(
      provider.classifyError(errorWithCode(status.INVALID_ARGUMENT)),
    ).toMatchObject({
      kind: "invalid_query",
      retryable: false,
    });
    expect(
      provider.classifyError(new Error("Unsupported source ranking mode")),
    ).toMatchObject({
      kind: "invalid_query",
      retryable: false,
    });
  });
});

const hasUndefinedValue = (value: unknown): boolean => {
  if (value === undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(hasUndefinedValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).some(hasUndefinedValue);
  }

  return false;
};

class RecordingCollector implements XDailyCollectorClientPort {
  readonly requests: XDailyCollectorRequest[] = [];

  async collectDailySearch(
    request: XDailyCollectorRequest,
  ): Promise<
    Awaited<ReturnType<XDailyCollectorClientPort["collectDailySearch"]>>
  > {
    this.requests.push(request);

    return {
      posts: [
        {
          tweetId: "123",
          canonicalUrl: "https://x.com/a/status/123",
          text: "hello",
          authorHandle: "a",
          authorName: "A",
          publishedAt: new Date("2026-06-27T00:00:00.000Z"),
          metrics: {
            likes: 100,
            retweets: 10,
            replies: 4,
          },
          mediaUrls: [],
          sourceProduct: "top",
          trendScore: 138,
        },
        {
          tweetId: "low-signal",
          canonicalUrl: "https://x.com/b/status/low-signal",
          text: "low signal",
          authorHandle: "b",
          publishedAt: new Date("2026-06-27T00:01:00.000Z"),
          metrics: {
            likes: 1,
            retweets: 0,
            replies: 0,
          },
          mediaUrls: [],
          sourceProduct: "latest",
          trendScore: 1,
        },
      ],
      nextCursor: "cursor-1",
      warnings: [{ code: "partial", message: "one page skipped" }],
    };
  }
}

class MultiQueryCollector implements XDailyCollectorClientPort {
  readonly requests: XDailyCollectorRequest[] = [];

  async collectDailySearch(
    request: XDailyCollectorRequest,
  ): Promise<
    Awaited<ReturnType<XDailyCollectorClientPort["collectDailySearch"]>>
  > {
    this.requests.push(request);

    return {
      posts: postsByQuery(request.query),
      nextCursor: `next-${request.query.replace(/\s+/gu, "-")}`,
      warnings: [],
    };
  }
}

class FailingSecondQueryCollector implements XDailyCollectorClientPort {
  readonly requests: XDailyCollectorRequest[] = [];

  constructor(
    private readonly failure: Error,
    private readonly includePosts = true,
  ) {}

  async collectDailySearch(
    request: XDailyCollectorRequest,
  ): Promise<
    Awaited<ReturnType<XDailyCollectorClientPort["collectDailySearch"]>>
  > {
    this.requests.push(request);
    if (this.requests.length > 1) {
      throw this.failure;
    }

    return {
      posts: this.includePosts ? [
        xPost({
          tweetId: "ai-agents",
          text: "AI agents broad post",
          likes: 20,
          trendScore: 20,
        }),
      ] : [],
      nextCursor: "next-ai-cursor",
      warnings: [],
    };
  }
}

const postsByQuery = (
  query: string,
): Awaited<
  ReturnType<XDailyCollectorClientPort["collectDailySearch"]>
>["posts"] => {
  switch (query) {
    case "cursor ai":
      return [
        xPost({
          tweetId: "cursor",
          text: "Cursor AI coding agent release",
          likes: 180,
          trendScore: 200,
        }),
      ];
    case "mcp server":
      return [
        xPost({
          tweetId: "shared",
          text: "MCP server developer workflow",
          likes: 90,
          trendScore: 160,
        }),
      ];
    case "claude code":
      return [
        xPost({
          tweetId: "shared",
          text: "Claude Code duplicate lower signal",
          likes: 30,
          trendScore: 60,
        }),
      ];
    default:
      return [
        xPost({
          tweetId: "ai-agents",
          text: "AI agents broad post",
          likes: 20,
          trendScore: 20,
        }),
      ];
  }
};

const xPost = (params: {
  readonly tweetId: string;
  readonly text: string;
  readonly likes: number;
  readonly trendScore: number;
}): Awaited<
  ReturnType<XDailyCollectorClientPort["collectDailySearch"]>
>["posts"][number] => ({
  tweetId: params.tweetId,
  canonicalUrl: `https://x.com/a/status/${params.tweetId}`,
  text: params.text,
  authorHandle: "a",
  publishedAt: new Date("2026-06-27T00:00:00.000Z"),
  metrics: {
    likes: params.likes,
    retweets: 10,
    replies: 4,
  },
  mediaUrls: [],
  sourceProduct: "top",
  trendScore: params.trendScore,
});

const errorWithCode = (
  code: number,
  metadataValues: Readonly<Record<string, string>> = {},
): Error & { code: number; details: string; metadata: Metadata } => {
  const metadata = new Metadata();
  for (const [key, value] of Object.entries(metadataValues)) {
    metadata.set(key, value);
  }
  const error = new Error(`grpc ${code}`) as Error & {
    code: number;
    details: string;
    metadata: Metadata;
  };
  error.code = code;
  error.details = `grpc ${code}`;
  error.metadata = metadata;
  return error;
};
