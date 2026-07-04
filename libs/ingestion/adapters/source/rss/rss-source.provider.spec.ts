import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { certifySourceProvider } from "../testing/source-provider-certification";
import { validateFeedUrl } from "./feed-url-policy";
import { FixtureRssClient } from "./fixture-rss-client";
import type { RssClientPort } from "./rss-client.port";
import { RssSourceProvider } from "./rss-source.provider";

describe("RssSourceProvider", () => {
  certifySourceProvider({
    providerFactory: () => new RssSourceProvider(new FixtureRssClient()),
    validQuery: { mode: "url", query: "https://example.test/feed.xml" },
    unsupportedQueryMode: "thread",
    expectedProviderKey: "rss",
    expectedFailureKind: "unavailable",
  });

  it("rejects local or private feed URLs before scanning", () => {
    expect(validateFeedUrl("http://localhost/feed.xml")).toEqual({
      ok: false,
      reason: "Feed URL host is not allowed.",
    });
    expect(validateFeedUrl("http://192.168.1.10/feed.xml")).toEqual({
      ok: false,
      reason: "Feed URL must not target private or local networks.",
    });
    expect(validateFeedUrl("http://169.254.169.254/latest/meta-data")).toEqual({
      ok: false,
      reason: "Feed URL must not target private or local networks.",
    });
    expect(validateFeedUrl("file:///tmp/feed.xml")).toEqual({
      ok: false,
      reason: "Feed URL must use http or https.",
    });
  });

  it("normalizes RSS fixture items and skips empty entries", async () => {
    const provider = new RssSourceProvider(new FixtureRssClient());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = {
      mode: "url" as const,
      query: "https://example.test/feed.xml",
    };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items).toEqual([
      {
        externalId: "rss-guid-1",
        canonicalUrl: "https://example.test/rss/item-1",
        title: "RSS item 1",
        body: "First RSS item",
        authorHandle: "rss-author",
        publishedAt: new Date("2026-06-05T10:00:00.000Z"),
        metadata: {
          kind: "rss_item",
          feedUrl: "https://example.test/feed.xml",
        },
      },
      {
        externalId: "https://example.test/rss/item-2#1",
        canonicalUrl: "https://example.test/rss/item-2",
        title: "RSS item 2 without guid",
        body: "Second RSS item",
        authorHandle: undefined,
        publishedAt: new Date("2026-06-05T10:01:00.000Z"),
        metadata: {
          kind: "rss_item",
          feedUrl: "https://example.test/feed.xml",
        },
      },
    ]);
    expect(result.nextCursor).toBe(
      JSON.stringify({
        etag: '"fixture-rss-etag"',
        lastModified: "Fri, 05 Jun 2026 10:02:00 GMT",
      }),
    );
    expect(result.warnings).toEqual([
      "Some RSS items had no GUID; canonical URL fallback was used.",
    ]);
  });

  it("passes ETag and Last-Modified cursor metadata to the RSS client", async () => {
    const client = new FixtureRssClient();
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = {
      mode: "url" as const,
      query: "https://example.test/feed.xml",
    };

    const result = await provider.scan(
      {
        ...provider.planScan(query, context),
        cursor: JSON.stringify({
          etag: '"old-etag"',
          lastModified: "Fri, 05 Jun 2026 09:00:00 GMT",
        }),
      },
      context,
    );

    expect(result.items).toHaveLength(2);
    expect(client.lastRead).toEqual({
      feedUrl: "https://example.test/feed.xml",
      limit: 30,
      options: {
        etag: '"old-etag"',
        lastModified: "Fri, 05 Jun 2026 09:00:00 GMT",
      },
    });
    expect(result.nextCursor).toBe(
      JSON.stringify({
        etag: '"fixture-rss-etag"',
        lastModified: "Fri, 05 Jun 2026 10:02:00 GMT",
      }),
    );
  });

  it("uses source config maxItems to cap feed reads", async () => {
    const client = new FixtureRssClient();
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: { maxItems: 1 },
    };
    const query = {
      mode: "url" as const,
      query: "https://example.test/feed.xml",
    };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items).toHaveLength(1);
    expect(client.lastRead?.limit).toBe(1);
  });

  it("reads configured extra feed URLs with per-feed cursors and merges fresh items", async () => {
    const reads: {
      readonly feedUrl: string;
      readonly limit: number;
      readonly options: unknown;
    }[] = [];
    const primaryFeedUrl = "https://example.test/feed.xml";
    const extraFeedUrl = "https://hnrss.org/newest?q=Claude%20Code";
    const client = {
      async readFeed(feedUrl, limit, options) {
        reads.push({ feedUrl, limit, options });

        if (feedUrl === primaryFeedUrl) {
          return {
            items: [
              {
                guid: "google-news-fresh",
                link: "https://example.test/rss/google-news-fresh",
                title: "Fresh Google News RSS item",
                content: "A fresh RSS item from the primary feed.",
                publishedAt: new Date("2026-06-05T10:00:00.000Z"),
              },
              {
                guid: "google-news-old",
                link: "https://example.test/rss/google-news-old",
                title: "Old Google News RSS item",
                content: "A stale item that should not survive the age filter.",
                publishedAt: new Date("2026-05-01T10:00:00.000Z"),
              },
            ],
            etag: '"primary-etag"',
            lastModified: "Fri, 05 Jun 2026 10:00:00 GMT",
          };
        }

        return {
          items: [
            {
              guid: "hnrss-fresh",
              link: "https://news.ycombinator.com/item?id=3001",
              title: "Fresh HN RSS item",
              content: "A fresh item from the additional feed.",
              publishedAt: new Date("2026-06-05T11:00:00.000Z"),
            },
          ],
          etag: '"extra-etag"',
          lastModified: "Fri, 05 Jun 2026 11:00:00 GMT",
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: {
        maxItems: 4,
        maxItemAgeHours: 48,
        feedUrls: [extraFeedUrl],
      },
    };
    const query = {
      mode: "url" as const,
      query: primaryFeedUrl,
    };

    const result = await provider.scan(
      {
        ...provider.planScan(query, context),
        cursor: JSON.stringify({
          feeds: {
            [primaryFeedUrl]: { etag: '"old-primary-etag"' },
            [extraFeedUrl]: { etag: '"old-extra-etag"' },
          },
        }),
      },
      context,
    );

    expect(reads).toEqual([
      {
        feedUrl: primaryFeedUrl,
        limit: 2,
        options: { etag: '"old-primary-etag"' },
      },
      {
        feedUrl: extraFeedUrl,
        limit: 2,
        options: { etag: '"old-extra-etag"' },
      },
    ]);
    expect(result.items.map((item) => item.externalId)).toEqual([
      "hnrss-fresh",
      "google-news-fresh",
    ]);
    expect(result.items.map((item) => item.metadata)).toEqual([
      expect.objectContaining({ feedUrl: extraFeedUrl }),
      expect.objectContaining({ feedUrl: primaryFeedUrl }),
    ]);
    expect(JSON.parse(result.nextCursor ?? "{}")).toEqual({
      feeds: {
        [primaryFeedUrl]: {
          etag: '"primary-etag"',
          lastModified: "Fri, 05 Jun 2026 10:00:00 GMT",
        },
        [extraFeedUrl]: {
          etag: '"extra-etag"',
          lastModified: "Fri, 05 Jun 2026 11:00:00 GMT",
        },
      },
    });
    expect(result.warnings).toContain(
      "Some RSS items were older than maxItemAgeHours=48; they were skipped.",
    );
  });

  it("keeps successful multi-feed RSS reads when one extra feed times out", async () => {
    const primaryFeedUrl = "https://example.test/feed.xml";
    const slowFeedUrl = "https://hnrss.org/newest?q=AI%20agents";
    const client = {
      async readFeed(feedUrl) {
        if (feedUrl === slowFeedUrl) {
          throw new Error("The operation was aborted due to timeout");
        }

        return {
          items: [
            {
              guid: "primary-fresh",
              link: "https://example.test/rss/primary-fresh",
              title: "Primary fresh RSS item",
              content: "A primary item should survive a secondary timeout.",
              publishedAt: new Date("2026-06-05T10:00:00.000Z"),
            },
          ],
          etag: '"primary-etag"',
          lastModified: "Fri, 05 Jun 2026 10:00:00 GMT",
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: {
        maxItems: 4,
        feedUrls: [slowFeedUrl],
      },
    };

    const result = await provider.scan(
      {
        ...provider.planScan({ mode: "url", query: primaryFeedUrl }, context),
        cursor: JSON.stringify({
          feeds: {
            [slowFeedUrl]: { etag: '"old-slow-etag"' },
          },
        }),
      },
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "primary-fresh",
    ]);
    expect(result.warnings).toContain(
      "RSS feed https://hnrss.org/newest?q=AI%20agents could not be read: The operation was aborted due to timeout",
    );
    expect(JSON.parse(result.nextCursor ?? "{}")).toEqual({
      feeds: {
        [slowFeedUrl]: { etag: '"old-slow-etag"' },
        [primaryFeedUrl]: {
          etag: '"primary-etag"',
          lastModified: "Fri, 05 Jun 2026 10:00:00 GMT",
        },
      },
    });
  });

  it("skips RSS entries older than the configured relative feed age window", async () => {
    const client = {
      async readFeed() {
        return {
          items: [
            {
              guid: "old-item",
              link: "https://example.test/rss/old-item",
              title: "Old RSS item",
              content: "This item is too old for a daily news feed.",
              publishedAt: new Date("2026-06-01T10:00:00.000Z"),
            },
            {
              guid: "fresh-item",
              link: "https://example.test/rss/fresh-item",
              title: "Fresh RSS item",
              content: "This item is inside the feed recency window.",
              publishedAt: new Date("2026-06-05T10:00:00.000Z"),
            },
          ],
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
      config: { maxItemAgeHours: 48 },
    };
    const query = {
      mode: "url" as const,
      query: "https://example.test/feed.xml",
    };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual(["fresh-item"]);
    expect(result.warnings).toContain(
      "Some RSS items were older than maxItemAgeHours=48; they were skipped.",
    );
  });

  it("skips readable RSS entries without a published timestamp", async () => {
    const client = {
      async readFeed() {
        return {
          items: [
            {
              guid: "missing-timestamp",
              link: "https://example.test/rss/missing-timestamp",
              title: "Readable but missing timestamp",
              content:
                "This entry must not be ingested with an epoch fallback.",
            },
            {
              guid: "valid-timestamp",
              link: "https://example.test/rss/valid-timestamp",
              title: "Readable with timestamp",
              content: "This entry is safe to ingest.",
              publishedAt: new Date("2026-06-05T10:03:00.000Z"),
            },
          ],
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = {
      mode: "url" as const,
      query: "https://example.test/feed.xml",
    };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "valid-timestamp",
    ]);
    expect(result.items[0]?.publishedAt).toEqual(
      new Date("2026-06-05T10:03:00.000Z"),
    );
    expect(result.items[0]?.metadata).toEqual({
      kind: "rss_item",
      feedUrl: "https://example.test/feed.xml",
    });
    expect(result.warnings).toEqual([
      "Some RSS items had no published timestamp; they were skipped.",
    ]);
  });

  it("skips readable RSS entries without a canonical link", async () => {
    const client = {
      async readFeed() {
        return {
          items: [
            {
              guid: "missing-link",
              title: "Readable but missing link",
              content:
                "This entry must not cite the feed URL as the article URL.",
              publishedAt: new Date("2026-06-05T10:04:00.000Z"),
            },
            {
              guid: "valid-link",
              link: "https://example.test/rss/valid-link",
              title: "Readable with link",
              content: "This entry has a stable citation URL.",
              publishedAt: new Date("2026-06-05T10:05:00.000Z"),
            },
          ],
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = {
      mode: "url" as const,
      query: "https://example.test/feed.xml",
    };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual(["valid-link"]);
    expect(result.items[0]?.canonicalUrl).toBe(
      "https://example.test/rss/valid-link",
    );
    expect(result.warnings).toEqual([
      "Some RSS items had no canonical link; they were skipped.",
    ]);
  });

  it("extracts search query metadata from query-backed RSS feeds", async () => {
    const provider = new RssSourceProvider(new FixtureRssClient());
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = {
      mode: "url" as const,
      query: "https://hnrss.org/newest?q=Flutter",
    };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items[0]?.metadata).toEqual({
      kind: "rss_item",
      feedUrl: "https://hnrss.org/newest?q=Flutter",
      searchQuery: "Flutter",
    });
  });

  it("preserves normalized RSS media metadata for summary previews", async () => {
    const client = {
      async readFeed() {
        return {
          items: [
            {
              guid: "rss-media-item",
              link: "https://example.test/rss/media-item",
              title: "Media rich RSS item",
              content: "RSS item with a safe preview image.",
              mediaThumbnailUrl: "https://cdn.example.test/rss-thumb.jpg",
              mediaContentUrl: "https://cdn.example.test/rss-image.jpg",
              mediaContentType: "image/jpeg",
              enclosureUrl: "https://cdn.example.test/rss-video.mp4",
              enclosureType: "video/mp4",
              publishedAt: new Date("2026-06-05T10:06:00.000Z"),
            },
          ],
        };
      },
    } satisfies RssClientPort;
    const provider = new RssSourceProvider(client);
    const context = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "rss-binding-1",
      scanJobId: "scan-job-1",
      correlationId: "correlation-1",
    };
    const query = {
      mode: "url" as const,
      query: "https://example.test/feed.xml",
    };

    const result = await provider.scan(
      provider.planScan(query, context),
      context,
    );

    expect(result.items[0]?.metadata).toEqual({
      kind: "rss_item",
      feedUrl: "https://example.test/feed.xml",
      mediaThumbnailUrl: "https://cdn.example.test/rss-thumb.jpg",
      mediaContentUrl: "https://cdn.example.test/rss-image.jpg",
      mediaContentType: "image/jpeg",
      enclosureUrl: "https://cdn.example.test/rss-video.mp4",
      enclosureType: "video/mp4",
    });
  });
});
