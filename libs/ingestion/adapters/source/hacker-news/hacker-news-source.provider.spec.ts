import { SystemClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { certifySourceProvider } from "../testing/source-provider-certification";
import { FixtureHackerNewsClient } from "./fixture-hacker-news-client";
import type { HackerNewsClientPort } from "./hacker-news-client.port";
import { HackerNewsSourceProvider } from "./hacker-news-source.provider";

describe("HackerNewsSourceProvider", () => {
  certifySourceProvider({
    providerFactory: () =>
      new HackerNewsSourceProvider(new FixtureHackerNewsClient(), new SystemClock()),
    validQuery: { mode: "search", query: "monitoring" },
    unsupportedQueryMode: "thread",
    expectedProviderKey: "hacker-news",
    expectedFailureKind: "unavailable",
  });

  it("normalizes fixture stories and skips deleted items", async () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient(), new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = { mode: "search" as const, query: "monitoring" };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items).toEqual([
      {
        externalId: "hn:1001",
        canonicalUrl: "https://news.ycombinator.com/item?id=1001",
        title: "Show HN: Social monitoring architecture",
        body: "",
        authorHandle: "alice",
        publishedAt: new Date(1_780_000_000 * 1000),
        metadata: {
          kind: "hacker_news_story",
          source: "search",
          searchQuery: "monitoring",
          externalUrl: "https://example.test/hn/social-monitoring",
          points: 42,
          comments: 9,
        },
      },
      {
        externalId: "hn:1002",
        canonicalUrl: "https://news.ycombinator.com/item?id=1002",
        title: "Ask HN: Reliable RSS and API ingestion",
        body: "How do you build reliable social/news ingestion?",
        authorHandle: "bob",
        publishedAt: new Date(1_780_000_060 * 1000),
        metadata: {
          kind: "hacker_news_story",
          source: "search",
          searchQuery: "monitoring",
          points: 75,
          comments: 18,
        },
      },
    ]);
    expect(result.warnings).toEqual([
      "Some Hacker News items were deleted/dead and skipped.",
    ]);
  });

  it("supports story and comment search scan passes in one binding", async () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient(), new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: {
        maxItems: 4,
        scanPasses: [
          {
            mode: "search",
            target: "story",
            query: "monitoring",
            maxItems: 2,
          },
          {
            mode: "search",
            target: "comment",
            query: "monitoring",
            maxItems: 2,
          },
        ],
      },
    };
    const query = { mode: "search" as const, query: "monitoring" };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "hn:2002",
      "hn:2001",
      "hn:1002",
      "hn:1001",
    ]);
    expect(result.items[0]).toMatchObject({
      externalId: "hn:2002",
      title: "Ask HN: Reliable RSS and API ingestion",
      body: "The hard part is comment-level evidence and deduping by source.",
      metadata: {
        kind: "hacker_news_comment",
        source: "comment_search",
        searchQuery: "monitoring",
        storyId: 1002,
        parentId: 1002,
      },
    });
  });

  it("filters broad listing scan passes by required keywords", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const client = {
      async listStories() {
        return [
          {
            id: 4001,
            title: "Ask HN: What books did you enjoy recently?",
            time: nowSeconds,
            score: 4,
          },
          {
            id: 4002,
            title: "Ask HN: Will AI agents change developer workflows?",
            time: nowSeconds + 1,
            score: 8,
          },
        ];
      },
      async searchStories() {
        return [];
      },
      async searchComments() {
        return [];
      },
    } satisfies HackerNewsClientPort;
    const provider = new HackerNewsSourceProvider(client, new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: {
        maxItems: 10,
        scanPasses: [
          {
            mode: "listing",
            listing: "ask",
            maxItems: 10,
            requiredKeywords: [
              "ai",
              "agent",
              "developer",
              "programming",
              "security",
            ],
          },
        ],
      },
    };

    const result = await provider.scan(
      provider.planScan({ mode: "search", query: "developer tools" }, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual(["hn:4002"]);
  });

  it("filters comment search scan passes by story keywords", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const client = {
      async listStories() {
        return [];
      },
      async searchStories() {
        return [];
      },
      async searchComments() {
        return [
          {
            kind: "comment" as const,
            id: 5001,
            storyId: 9001,
            parentId: 9001,
            storyTitle: "Ask HN: Who is hiring? (July 2026)",
            text: "We use Claude Code for internal developer tools.",
            time: nowSeconds,
          },
          {
            kind: "comment" as const,
            id: 5002,
            storyId: 9002,
            parentId: 9002,
            storyTitle: "Show HN: AI agent tool for code review",
            text: "The workflow is inspired by Claude Code.",
            time: nowSeconds + 1,
          },
        ];
      },
    } satisfies HackerNewsClientPort;
    const provider = new HackerNewsSourceProvider(client, new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: {
        maxItems: 10,
        scanPasses: [
          {
            mode: "search",
            target: "comment",
            query: "claude code",
            maxItems: 10,
            requiredStoryKeywords: ["ai", "agent", "code", "developer tool"],
          },
        ],
      },
    };

    const result = await provider.scan(
      provider.planScan({ mode: "search", query: "developer tools" }, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual(["hn:5002"]);
  });

  it("keeps twenty-eight configured scan passes for broader daily discovery", async () => {
    const client = new RecordingHackerNewsClient();
    const provider = new HackerNewsSourceProvider(client, new SystemClock());
    const scanPasses = Array.from({ length: 28 }, (_, index) => ({
      mode: "search" as const,
      target: "story" as const,
      query: `topic-${index + 1}`,
      maxItems: 1,
    }));
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: {
        maxItems: 28,
        scanPasses,
      },
    };

    await provider.scan(
      provider.planScan({ mode: "search", query: "monitoring" }, context),
      context,
    );

    expect(client.storySearchQueries).toEqual(
      scanPasses.map((pass) => pass.query),
    );
  });

  it("skips stale multi-pass search hits when maxItemAgeHours is configured", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const client = {
      async searchStories() {
        return [
          {
            id: 3001,
            title: "Old broad search hit",
            time: nowSeconds - 14 * 24 * 60 * 60,
          },
          {
            id: 3002,
            title: "Fresh developer tooling discussion",
            time: nowSeconds - 30 * 60,
          },
        ];
      },
      async searchComments() {
        return [];
      },
      async listStories() {
        return [];
      },
    } satisfies HackerNewsClientPort;
    const provider = new HackerNewsSourceProvider(client, new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: {
        maxItems: 10,
        maxItemAgeHours: 48,
        scanPasses: [
          {
            mode: "search",
            target: "story",
            query: "developer tools",
          },
        ],
      },
    };

    const result = await provider.scan(
      provider.planScan({ mode: "search", query: "developer tools" }, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual(["hn:3002"]);
    expect(result.warnings).toContain(
      "Some Hacker News items were older than maxItemAgeHours=48; they were skipped.",
    );
  });

  it("supports live listing mode through the client port without changing normalized output", async () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient(), new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = { mode: "listing" as const, query: "top" };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items[0]).toMatchObject({
      externalId: "hn:1001",
      title: "Show HN: Social monitoring architecture",
    });
  });

  it("uses source config maxItems to cap listing and search reads", async () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient(), new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: { maxItems: 1 },
    };
    const query = { mode: "search" as const, query: "monitoring" };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.externalId).toBe("hn:1001");
  });

  it("skips readable stories without a valid time timestamp", async () => {
    const client = {
      async searchStories() {
        return [
          {
            id: 2001,
            title: "Readable but missing HN time",
            text: "This story must not be ingested with an epoch fallback.",
            by: "timestampless",
            score: 15,
            comments: 4,
          },
          {
            id: 2002,
            title: "Readable with HN time",
            text: "This story is safe to ingest.",
            by: "timely",
            time: 1_780_000_180,
            score: 30,
            comments: 8,
          },
        ];
      },
      async searchComments() {
        return [];
      },
      async listStories() {
        return [];
      },
    } satisfies HackerNewsClientPort;
    const provider = new HackerNewsSourceProvider(client, new SystemClock());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "hn-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = { mode: "search" as const, query: "monitoring" };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual(["hn:2002"]);
    expect(result.items[0]?.publishedAt).toEqual(
      new Date(1_780_000_180 * 1000),
    );
    expect(result.warnings).toEqual([
      "Some Hacker News items had no valid time timestamp; they were skipped.",
    ]);
  });

  it("rejects unsupported listing names before provider calls", () => {
    const provider = new HackerNewsSourceProvider(new FixtureHackerNewsClient(), new SystemClock());

    expect(
      provider.validateBinding({ mode: "listing", query: "frontpage" }),
    ).toEqual({
      ok: false,
      reason: "Unsupported Hacker News listing: frontpage",
    });
  });
});

class RecordingHackerNewsClient implements HackerNewsClientPort {
  readonly storySearchQueries: string[] = [];

  async searchStories(
    query: string,
    _limit: number,
  ): Promise<Awaited<ReturnType<HackerNewsClientPort["searchStories"]>>> {
    this.storySearchQueries.push(query);

    return [
      {
        id: this.storySearchQueries.length,
        title: `Story for ${query}`,
        time: 1_780_000_000 + this.storySearchQueries.length,
      },
    ];
  }

  async searchComments(): Promise<
    Awaited<ReturnType<HackerNewsClientPort["searchComments"]>>
  > {
    return [];
  }

  async listStories(): Promise<
    Awaited<ReturnType<HackerNewsClientPort["listStories"]>>
  > {
    return [];
  }
}
