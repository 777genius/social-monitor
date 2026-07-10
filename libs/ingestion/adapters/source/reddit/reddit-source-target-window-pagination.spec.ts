import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  SourceProviderScanContext,
  SourceRuntimeConfig,
} from "../../../ports";
import type {
  RedditClientPort,
  RedditCommentPage,
  RedditListingPage,
  RedditListSubredditPostsRequest,
} from "./reddit-client.port";
import { RedditSourceProvider } from "./reddit-source.provider";
import type { RedditTokenProviderPort } from "./reddit-token-provider.port";

describe("RedditSourceProvider target window pagination", () => {
  it("keeps top/day for an open target day instead of widening to week", async () => {
    const client = new CapturingRedditClient(
      new Map<string, RedditListingPage>([
        [
          "ClaudeAI:top:day|after:",
          {
            posts: [
              redditPost({
                id: "today",
                createdUtc: Date.parse("2026-07-09T12:00:00Z") / 1000,
              }),
            ],
          },
        ],
      ]),
    );
    const provider = new RedditSourceProvider(
      client,
      new StaticTokenProvider(),
    );
    const context = scanContext({
      maxItems: 2,
      targetPublishedWindow: {
        startInclusive: "2026-07-09T00:00:00.000Z",
        endExclusive: "2026-07-10T00:00:00.000Z",
        observedAt: "2026-07-09T18:00:00.000Z",
      },
      scanPasses: [
        {
          mode: "listing",
          subreddit: "ClaudeAI",
          listing: "top",
          topTime: "day",
          maxItems: 2,
        },
      ],
      adaptivePagination: {
        enabled: true,
        targetItems: 2,
        maxPages: 2,
        minNewItemsPerPage: 1,
        maxDuplicateRate: 0.75,
      },
    });
    const plan = provider.planScan(
      { mode: "search", query: "ClaudeAI top" },
      context,
    );

    const result = await provider.scan(plan, context);

    expect(client.listingRequests.map((request) => request.topTime)).toEqual([
      "day",
    ]);
    expect(result.items.map((item) => item.externalId)).toEqual([
      "reddit:t3_today",
    ]);
  });

  it("continues past newer Reddit pages and counts only target-window posts", async () => {
    const client = new CapturingRedditClient(
      new Map<string, RedditListingPage>([
        [
          "ClaudeAI:top:week|after:",
          {
            after: "page-2",
            posts: [
              redditPost({
                id: "newer",
                createdUtc: Date.parse("2026-07-08T12:00:00Z") / 1000,
              }),
            ],
          },
        ],
        [
          "ClaudeAI:top:week|after:page-2",
          {
            posts: [
              redditPost({
                id: "target",
                createdUtc: Date.parse("2026-07-07T12:00:00Z") / 1000,
              }),
            ],
          },
        ],
      ]),
    );
    const provider = new RedditSourceProvider(
      client,
      new StaticTokenProvider(),
    );
    const context = scanContext({
      maxItems: 2,
      targetPublishedWindow: {
        startInclusive: "2026-07-07T00:00:00.000Z",
        endExclusive: "2026-07-08T00:00:00.000Z",
      },
      scanPasses: [
        {
          mode: "listing",
          subreddit: "ClaudeAI",
          listing: "top",
          topTime: "day",
          maxItems: 2,
        },
      ],
      adaptivePagination: {
        enabled: true,
        targetItems: 2,
        maxPages: 2,
        minNewItemsPerPage: 1,
        maxDuplicateRate: 0.75,
      },
    });
    const plan = provider.planScan(
      { mode: "search", query: "ClaudeAI top" },
      context,
    );

    const result = await provider.scan(plan, context);

    expect(client.listingRequests.map((request) => request.after)).toEqual([
      undefined,
      "page-2",
    ]);
    expect(client.listingRequests.map((request) => request.topTime)).toEqual([
      "week",
      "week",
    ]);
    expect(result.items.map((item) => item.externalId)).toEqual([
      "reddit:t3_target",
    ]);
    expect(result.warnings).toContain(
      "reddit_adaptive_pagination.stats;pass=ClaudeAI:top:day;pages=2;items=1;duplicates=0",
    );
  });
});

class StaticTokenProvider implements RedditTokenProviderPort {
  async getAccessToken(): Promise<string> {
    return "reddit-app-only-token";
  }
}

class CapturingRedditClient implements RedditClientPort {
  readonly listingRequests: RedditListSubredditPostsRequest[] = [];

  constructor(
    private readonly listingResponses: ReadonlyMap<string, RedditListingPage>,
  ) {}

  async listSubredditPosts(
    request: RedditListSubredditPostsRequest,
  ): Promise<RedditListingPage> {
    this.listingRequests.push(request);

    return this.listingResponses.get(listingPageKey(request)) ?? { posts: [] };
  }

  async searchPosts(): Promise<RedditListingPage> {
    return { posts: [] };
  }

  async listPostComments(): Promise<RedditCommentPage> {
    return { comments: [] };
  }
}

const listingPageKey = (request: RedditListSubredditPostsRequest): string =>
  `${request.subreddit}:${request.listing}:${request.topTime ?? ""}|after:${request.after ?? ""}`;

function scanContext(config: SourceRuntimeConfig): SourceProviderScanContext {
  return {
    tenantId: tenantId("tenant-reddit-target-window-test"),
    workspaceId: workspaceId("workspace-reddit-target-window-test"),
    sourceBindingId: "source-binding-reddit-target-window-test",
    scanJobId: "scan-job-reddit-target-window-test",
    correlationId: "correlation-reddit-target-window-test",
    config,
  };
}

function redditPost(overrides: Partial<RedditListingPage["posts"][number]>) {
  const id = overrides.id ?? "post-1";

  return {
    id,
    name: `t3_${id}`,
    subreddit: "ClaudeAI",
    title: "Claude Code Reddit signal",
    selftext: "Useful discussion.",
    permalink: `/r/ClaudeAI/comments/${id}/reddit_post/`,
    createdUtc: Date.parse("2026-07-07T12:00:00Z") / 1000,
    score: 42,
    ...overrides,
  };
}
