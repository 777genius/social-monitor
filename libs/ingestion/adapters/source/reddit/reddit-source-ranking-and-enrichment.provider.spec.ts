import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  SourceProviderScanContext,
  SourceRuntimeConfig,
} from "../../../ports";
import type {
  RedditClientPort,
  RedditCommentPage,
  RedditListPostCommentsRequest,
  RedditListSubredditPostsRequest,
  RedditPost,
  RedditSearchPostsRequest,
} from "./reddit-client.port";
import { RedditSourceProvider } from "./reddit-source.provider";
import type { RedditTokenProviderPort } from "./reddit-token-provider.port";

describe("RedditSourceProvider ranking and selected enrichment", () => {
  it("defaults multi-pass ranking to relevance-first with engagement as a capped bonus", async () => {
    const provider = providerFor(
      clientWithPosts([
        redditPost({
          id: "viral-off-topic",
          title: "Huge unrelated community thread",
          selftext: "General launch chatter.",
          score: 10_000,
          numComments: 2_000,
        }),
        redditPost({
          id: "mcp-relevant",
          title: "Claude Code MCP server reliability notes",
          selftext: "Developers compare retries and auth failures.",
          score: 20,
          numComments: 3,
        }),
      ]),
    );
    const context = scanContext({
      maxItems: 2,
      scanPasses: [topOpenAiPass({ maxItems: 2 })],
    });

    const result = await provider.scan(
      provider.planScan(
        { mode: "search", query: "Claude Code MCP server reliability" },
        context,
      ),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "reddit:t3_mcp-relevant",
      "reddit:t3_viral-off-topic",
    ]);
  });

  it("fetches Reddit comments only for selected top-ranked multi-pass items", async () => {
    const client = clientWithPosts(
      [
        redditPost({
          id: "viral-off-topic",
          title: "Huge unrelated community thread",
          score: 10_000,
          numComments: 2_000,
        }),
        redditPost({
          id: "mcp-relevant",
          title: "Claude Code MCP server reliability notes",
          score: 20,
          numComments: 3,
        }),
      ],
      new Map([
        [
          "mcp-relevant",
          {
            comments: [
              {
                id: "comment-1",
                name: "t1_comment_1",
                body: "The comments confirm the MCP reliability issue.",
                parentId: "t3_mcp-relevant",
                createdUtc: 1_782_230_060,
                score: 12,
                depth: 0,
              },
            ],
          },
        ],
      ]),
    );
    const provider = providerFor(client);
    const context = scanContext({
      maxItems: 1,
      scanPasses: [
        topOpenAiPass({
          maxItems: 2,
          includeComments: true,
          maxCommentsPerPost: 2,
        }),
      ],
    });

    const result = await provider.scan(
      provider.planScan(
        { mode: "search", query: "Claude Code MCP server reliability" },
        context,
      ),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "reddit:t3_mcp-relevant",
    ]);
    expect(client.commentRequests.map((request) => request.postId)).toEqual([
      "mcp-relevant",
    ]);
    expect(result.conversationUnits?.map((unit) => unit.providerUnitId)).toEqual(
      ["t1_comment_1"],
    );
  });

  it("keeps selected Reddit posts when comment enrichment is unavailable", async () => {
    const client = clientWithPosts(
      [
        redditPost({
          id: "mcp-relevant",
          title: "Claude Code MCP server reliability notes",
          score: 20,
          numComments: 3,
        }),
      ],
      new Map([["mcp-relevant", new Error("comments timed out")]]),
    );
    const provider = providerFor(client);
    const context = scanContext({
      maxItems: 1,
      scanPasses: [topOpenAiPass({ maxItems: 1, includeComments: true })],
    });

    const result = await provider.scan(
      provider.planScan(
        { mode: "search", query: "Claude Code MCP server reliability" },
        context,
      ),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "reddit:t3_mcp-relevant",
    ]);
    expect(result.conversationUnits).toEqual([]);
    expect(result.warnings).toContain(
      "Reddit comment enrichment degraded (reddit:t3_mcp-relevant): comments timed out",
    );
  });

  it("keeps single-pass Reddit posts when comment enrichment is unavailable", async () => {
    const client = clientWithPosts(
      [
        redditPost({
          id: "mcp-relevant",
          title: "Claude Code MCP server reliability notes",
          score: 20,
          numComments: 3,
        }),
      ],
      new Map([["mcp-relevant", new Error("comments timed out")]]),
    );
    const provider = providerFor(client);
    const context = scanContext({
      maxItems: 1,
      subreddit: "OpenAI",
      listing: "hot",
      includeComments: true,
    });

    const result = await provider.scan(
      provider.planScan({ mode: "listing", query: "OpenAI:hot" }, context),
      context,
    );

    expect(result.items.map((item) => item.externalId)).toEqual([
      "reddit:t3_mcp-relevant",
    ]);
    expect(result.conversationUnits).toEqual([]);
    expect(result.warnings).toContain(
      "Reddit comment enrichment degraded (reddit:t3_mcp-relevant): comments timed out",
    );
  });

  it("uses the least restrictive comment expansion when duplicate posts appear in multiple passes", async () => {
    const client = clientWithPosts([
      redditPost({
        id: "mcp-relevant",
        title: "Claude Code MCP server reliability notes",
        score: 20,
        numComments: 3,
      }),
    ]);
    const provider = providerFor(client);
    const context = scanContext({
      maxItems: 1,
      scanPasses: [
        topOpenAiPass({
          maxItems: 1,
          includeComments: true,
          maxCommentsPerPost: 1,
          commentDepth: 1,
          minScore: 20,
        }),
        topOpenAiPass({
          maxItems: 1,
          includeComments: true,
          commentDepth: 5,
          minScore: 0,
        }),
      ],
    });

    await provider.scan(
      provider.planScan(
        { mode: "search", query: "Claude Code MCP server reliability" },
        context,
      ),
      context,
    );

    expect(client.commentRequests).toHaveLength(1);
    expect(client.commentRequests[0]).toMatchObject({
      postId: "mcp-relevant",
      limit: 5,
      depth: 5,
    });
  });
});

class CapturingRedditClient implements RedditClientPort {
  readonly listingRequests: RedditListSubredditPostsRequest[] = [];
  readonly searchRequests: RedditSearchPostsRequest[] = [];
  readonly commentRequests: RedditListPostCommentsRequest[] = [];

  constructor(
    private readonly posts: readonly RedditPost[],
    private readonly commentResponses = new Map<
      string,
      RedditCommentPage | Error
    >(),
  ) {}

  async listSubredditPosts(
    request: RedditListSubredditPostsRequest,
  ): Promise<{ readonly posts: readonly RedditPost[] }> {
    this.listingRequests.push(request);

    return { posts: this.posts };
  }

  async searchPosts(
    request: RedditSearchPostsRequest,
  ): Promise<{ readonly posts: readonly RedditPost[] }> {
    this.searchRequests.push(request);

    return { posts: this.posts };
  }

  async listPostComments(
    request: RedditListPostCommentsRequest,
  ): Promise<RedditCommentPage> {
    this.commentRequests.push(request);
    const response = this.commentResponses.get(request.postId) ?? {
      comments: [],
    };

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }
}

class StaticTokenProvider implements RedditTokenProviderPort {
  async getAccessToken(): Promise<string> {
    return "reddit-app-only-token";
  }
}

const providerFor = (client: RedditClientPort): RedditSourceProvider =>
  new RedditSourceProvider(client, new StaticTokenProvider());

const clientWithPosts = (
  posts: readonly RedditPost[],
  commentResponses?: Map<string, RedditCommentPage | Error>,
): CapturingRedditClient => new CapturingRedditClient(posts, commentResponses);

const topOpenAiPass = (
  overrides: Readonly<Record<string, unknown>>,
): SourceRuntimeConfig["scanPasses"] => ({
  mode: "listing",
  subreddit: "OpenAI",
  listing: "top",
  topTime: "day",
  ...overrides,
});

const scanContext = (config: SourceRuntimeConfig): SourceProviderScanContext => ({
  tenantId: tenantId("tenant-reddit-ranking-test"),
  workspaceId: workspaceId("workspace-reddit-ranking-test"),
  sourceBindingId: "source-binding-reddit-ranking-test",
  scanJobId: "scan-job-reddit-ranking-test",
  correlationId: "correlation-reddit-ranking-test",
  config,
});

const redditPost = (overrides: Partial<RedditPost>): RedditPost => {
  const id = overrides.id ?? "post-1";

  return {
    id,
    name: `t3_${id}`,
    subreddit: "OpenAI",
    title: "Reddit post",
    selftext: "Useful discussion.",
    permalink: `/r/OpenAI/comments/${id}/reddit_post/`,
    author: "example-user",
    createdUtc: 1_782_230_000,
    score: 1,
    numComments: 0,
    ...overrides,
  };
};
