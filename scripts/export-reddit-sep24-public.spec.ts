import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RedditClientPort, RedditCommentPage, RedditListingPage, RedditListSubredditPostsRequest, RedditSearchPostsRequest } from "../libs/ingestion/adapters/source/reddit/reddit-client.port";
import { exportRedditSep24Public, parseRedditSep24Bindings, runRedditSep24PublicCli } from "./export-reddit-sep24-public";

const stamp = (day: string) => Date.parse(day) / 1000;
const post = (id: string, date: string) => ({ id, name: `t3_${id}`, subreddit: "ClaudeAI",
  title: `Post ${id}`, permalink: `/r/ClaudeAI/comments/${id}/post/`, createdUtc: stamp(date), score: 5 });

class Client implements RedditClientPort {
  readonly listingCalls: RedditListSubredditPostsRequest[] = [];
  readonly searchCalls: RedditSearchPostsRequest[] = [];
  constructor(private readonly pages: readonly RedditListingPage[], private readonly failAt?: number) {}
  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    this.listingCalls.push(request);
    if (this.failAt === this.listingCalls.length) throw new Error("Bearer secret must not be reported");
    return this.pages[this.listingCalls.length - 1] ?? { posts: [] };
  }
  async searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage> {
    this.searchCalls.push(request);
    return this.pages[this.searchCalls.length - 1] ?? { posts: [] };
  }
  async listPostComments(): Promise<RedditCommentPage> { return { comments: [] }; }
}

describe("Reddit Sep24 source-only export", () => {
  it("rejects credentials in operator bindings, including nested scan passes", () => {
    expect(() => parseRedditSep24Bindings([{ sourceBindingId: "b1", config: {
      scanPasses: [{ mode: "search", query: "AI", accessToken: "example" }],
    } }])).toThrow("credential field");
    expect(() => parseRedditSep24Bindings([{ sourceBindingId: "b1", config: {
      mode: "search", query: "AI", accessToken: "example",
    } }])).toThrow("credential field");
  });

  it("follows cursors, accepts only genuine in-window identities, and records terminal evidence", async () => {
    const client = new Client([
      { after: "next", posts: [post("newer", "2026-09-25T00:00:00Z"), post("a", "2026-09-24T00:00:00Z")] },
      { posts: [post("a", "2026-09-24T00:00:00Z"), post("b", "2026-09-24T23:59:59Z"),
        { ...post("bad", "2026-09-24T12:00:00Z"), name: "t3_other" }, post("older", "2026-09-23T23:59:59Z")] },
    ]);
    const bindings = parseRedditSep24Bindings([{ sourceBindingId: "binding-1", config: {
      mode: "listing", subreddit: "ClaudeAI", listing: "top", topTime: "day",
    } }]);
    const result = await exportRedditSep24Public(bindings, client, "injected-token", "operator-agent");
    expect(client.listingCalls.map((call) => ({ after: call.after, topTime: call.topTime, limit: call.limit }))).toEqual([
      { after: undefined, topTime: "all", limit: 100 },
      { after: "next", topTime: "all", limit: 100 },
    ]);
    expect(result.bindings[0]!.items.map((item) => item.externalId)).toEqual(["reddit:t3_a", "reddit:t3_b"]);
    expect(result.bindings[0]!.passes).toEqual([{ passIndex: 0, mode: "listing", pages: 2, postsSeen: 6,
      inWindow: 3, exported: 2, terminal: true, stopReason: "cursor_exhausted" }]);
    expect(result.coverage).toBe("unproven");
    expect(JSON.stringify(result)).not.toContain("injected-token");
  });

  it("reports a partial binding when a later page fails without exposing the error", async () => {
    const client = new Client([{ after: "next", posts: [post("a", "2026-09-24T12:00:00Z")] }], 2);
    const bindings = parseRedditSep24Bindings([{ sourceBindingId: "binding-1", config: {
      mode: "listing", subreddit: "ClaudeAI", listing: "new",
    } }]);
    const result = await exportRedditSep24Public(bindings, client, "injected-token", "operator-agent");
    expect(result.bindings[0]!.terminal).toBe(false);
    expect(result.bindings[0]!.passes[0]!.stopReason).toBe("request_failed");
    expect(result.bindings[0]!.items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("Bearer secret");
  });

  it("uses all-time, new-sort search and per-binding subreddit filters", async () => {
    const client = new Client([{ posts: [post("a", "2026-09-24T12:00:00Z"),
      { ...post("b", "2026-09-24T12:00:00Z"), subreddit: "other" }] }]);
    const bindings = parseRedditSep24Bindings([{ sourceBindingId: "binding-1", config: {
      scanPasses: [{ mode: "search", query: "AI tools", searchSort: "relevance",
        searchTime: "day", allowedSubreddits: ["ClaudeAI"] }],
    } }]);
    const result = await exportRedditSep24Public(bindings, client, "injected-token", "operator-agent");
    expect(client.searchCalls[0]!).toMatchObject({ query: "AI tools", sort: "new", time: "all" });
    expect(result.bindings[0]!.items.map((item) => item.externalId)).toEqual(["reddit:t3_a"]);
  });

  it("does not call a repeated cursor terminal or claim historical coverage", async () => {
    const client = new Client([{ after: "same", posts: [post("a", "2026-09-24T12:00:00Z")] },
      { after: "same", posts: [post("b", "2026-09-24T13:00:00Z")] }]);
    const bindings = parseRedditSep24Bindings([{ sourceBindingId: "binding-1", config: {
      mode: "listing", subreddit: "ClaudeAI", listing: "new",
    } }]);
    const result = await exportRedditSep24Public(bindings, client, "injected-token", "operator-agent");
    expect(result.bindings[0]!.terminal).toBe(false);
    expect(result.bindings[0]!.passes[0]!.stopReason).toBe("cursor_repeated");
    expect(result.bindings[0]!.items).toHaveLength(2);
    expect(result.coverage).toBe("unproven");
  });

  it("keeps terminal evidence separate for each binding", async () => {
    const client = new Client([
      { posts: [post("a", "2026-09-24T12:00:00Z")] },
      { after: "still-more", posts: [post("b", "2026-09-24T13:00:00Z")] },
    ], 3);
    const bindings = parseRedditSep24Bindings([
      { sourceBindingId: "one", config: { mode: "listing", subreddit: "ClaudeAI", listing: "new" } },
      { sourceBindingId: "two", config: { mode: "listing", subreddit: "ClaudeAI", listing: "new" } },
    ]);
    const result = await exportRedditSep24Public(bindings, client, "injected-token", "operator-agent");
    expect(result.bindings.map((binding) => ({ id: binding.sourceBindingId, terminal: binding.terminal })))
      .toEqual([{ id: "one", terminal: true }, { id: "two", terminal: false }]);
    expect(result.bindings[1]!.passes[0]!.stopReason).toBe("request_failed");
  });

  it("writes a private partial artifact and returns exit code 2 without storing OAuth", async () => {
    const directory = await mkdtemp(join(tmpdir(), "reddit-sep24-public-"));
    try {
      const input = join(directory, "bindings.json");
      const output = join(directory, "export.json");
      await writeFile(input, JSON.stringify([{ sourceBindingId: "one", config: {
        mode: "listing", subreddit: "ClaudeAI", listing: "new",
      } }]), { mode: 0o600 });
      const client = new Client([{ after: "next", posts: [post("a", "2026-09-24T12:00:00Z")] }], 2);
      const code = await runRedditSep24PublicCli([input, output], {
        REDDIT_ACCESS_TOKEN: "injected-token", REDDIT_USER_AGENT: "operator-agent",
      }, client);
      const artifact = await readFile(output, "utf8");
      expect(code).toBe(2);
      expect(JSON.parse(artifact).bindings[0].passes[0].stopReason).toBe("request_failed");
      expect(artifact).not.toContain("injected-token");
      expect((await stat(output)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
