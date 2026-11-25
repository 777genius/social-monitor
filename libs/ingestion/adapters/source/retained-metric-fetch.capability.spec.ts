import { RetainedMetricFetchAdapter } from "./retained-metric-fetch.capability";
import { HttpHackerNewsClient } from "./hacker-news/http-hacker-news-client";
import { target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";

const hnTarget = target({ externalId: "hn:123", providerKey: "hacker-news", canonicalUrl: "https://news.ycombinator.com/item?id=123" });
const story = { id: 123, type: "story", time: Date.parse(hnTarget.publishedAt) / 1000, score: 20, descendants: 5 };
const redditPost = { id: "abc", name: "t3_abc", createdUtc: Date.parse(target().publishedAt) / 1000,
  permalink: "/r/sandbox/comments/abc/retained_post/", score: 2, numComments: 1 };
describe("retained metric provider capability", () => {
  const token = { getAccessToken: jest.fn(async () => "fixture-token") };
  const reddit = { getPostsByIds: jest.fn() };
  const adapter = new RetainedMetricFetchAdapter(new HttpHackerNewsClient(), reddit, token, "sandbox-test");
  afterEach(() => jest.restoreAllMocks());
  it.each([null, { ...story, dead: true }, { ...story, deleted: true }])("accounts null/dead/deleted HN responses", async (payload) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(payload)));
    expect(await adapter.fetch([hnTarget])).toMatchObject({ ok: true, value: [{ metadata: null, reason: "null_dead_deleted" }] });
  });
  it.each([{ ...story, id: 124 }, { ...story, type: "unknown" }, { ...story, time: 1 }, { ...story, score: "20" }, { ...story, descendants: null }])("rejects wrong HN identity or malformed fields", async (payload) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(payload)));
    expect(await adapter.fetch([hnTarget])).toMatchObject({ ok: false });
  });
  it("uses existing HN getStory with bounded timeout and does not retry a rate error", async () => {
    const http = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(story)))
      .mockResolvedValueOnce(new Response("", { status: 429 }));
    expect(await adapter.fetch([hnTarget])).toMatchObject({ ok: true, value: [{ externalId: "hn:123", metadata: { points: 20, comments: 5 } }] });
    expect(http.mock.calls[0]?.[0]).toBe("https://hacker-news.firebaseio.com/v0/item/123.json");
    expect(http.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(await adapter.fetch([hnTarget])).toEqual({ ok: false, error: "provider_429_no_retry" });
    expect(http).toHaveBeenCalledTimes(2);
  });
  it("preserves bare Reddit storage identity and rejects duplicate/unexpected IDs from a capability", async () => {
    const post = { id: "abc", name: "t3_abc", createdUtc: Date.parse(target().publishedAt) / 1000,
      permalink: "/r/sandbox/comments/abc/example/", score: 2, numComments: 1 };
    reddit.getPostsByIds.mockResolvedValueOnce({ posts: [post], omittedIds: [] })
      .mockResolvedValueOnce({ posts: [post, post], omittedIds: [] })
      .mockResolvedValueOnce({ posts: [{ ...post, id: "def", name: "t3_def" }], omittedIds: [] });
    expect(await adapter.fetch([target({ externalId: "reddit:abc" })])).toMatchObject({ ok: true, value: [{ externalId: "reddit:abc" }] });
    expect(await adapter.fetch([target()])).toEqual({ ok: false, error: "provider_identity_mismatch" });
    expect(await adapter.fetch([target()])).toEqual({ ok: false, error: "provider_identity_mismatch" });
  });
  it("checks omitted accounting independently and never fetches RSS or X", async () => {
    reddit.getPostsByIds.mockResolvedValueOnce({ posts: [], omittedIds: ["t3_abc"] })
      .mockResolvedValueOnce({ posts: [], omittedIds: [] });
    expect(await adapter.fetch([target()])).toEqual({ ok: true, value: [] });
    expect(await adapter.fetch([target()])).toEqual({ ok: false, error: "omitted_identity_mismatch" });
    expect(await adapter.fetch([target({ providerKey: "rss" as never })])).toEqual({ ok: false, error: "invalid_ids" });
  });
  it("refreshes the whole two-post batch when a retained canonical URL is the normalizer's short form", async () => {
    reddit.getPostsByIds.mockResolvedValueOnce({ posts: [redditPost,
      { ...redditPost, id: "def", name: "t3_def", permalink: "/r/sandbox/comments/def/retained_post/" }], omittedIds: [] });
    expect(await adapter.fetch([
      target({ externalId: "reddit:abc", canonicalUrl: "https://www.reddit.com/comments/abc" }),
      target({ externalId: "reddit:t3_def", canonicalUrl: "https://www.reddit.com/r/sandbox/comments/def/old_slug/" }),
    ])).toEqual({ ok: true, value: [
      { externalId: "reddit:abc", returned: true, reason: null, metadata: { kind: "reddit_post", score: 2, numComments: 1 } },
      { externalId: "reddit:t3_def", returned: true, reason: null, metadata: { kind: "reddit_post", score: 2, numComments: 1 } },
    ] });
  });
  it.each([
    ["https://www.reddit.com/comments/abc", "/r/sandbox/comments/abc/retained_post/"],
    ["https://www.reddit.com/r/sandbox/comments/abc/example/", "/comments/abc"],
    ["https://www.reddit.com/r/sandbox/comments/abc/example/", "/r/sandbox/comments/abc/new_slug/"],
    ["https://reddit.com/comments/abc/", "https://old.reddit.com/r/sandbox/comments/abc/retained_post/"],
    ["https://old.reddit.com/r/sandbox/comments/abc/example", "https://reddit.com/comments/abc/"],
    ["https://www.reddit.com/comments/abc?sort=new", "https://www.reddit.com:443/r/sandbox/comments/abc/retained_post/?context=1"],
  ])("matches safe Reddit post identity across %s and %s", async (canonicalUrl, permalink) => {
    reddit.getPostsByIds.mockResolvedValueOnce({ posts: [{ ...redditPost, permalink }], omittedIds: [] });
    expect(await adapter.fetch([target({ canonicalUrl })])).toMatchObject({ ok: true, value: [{ externalId: "reddit:t3_abc", returned: true }] });
  });
  it.each([
    "https://foreign.example/r/sandbox/comments/abc/example/",
    "//foreign.example/r/sandbox/comments/abc/example/",
    "https://www.reddit.com.foreign.example/r/sandbox/comments/abc/example/",
    "http://www.reddit.com/r/sandbox/comments/abc/example/",
    "https://fixture-user@www.reddit.com/r/sandbox/comments/abc/example/",
    "https://:fixture-password@www.reddit.com/r/sandbox/comments/abc/example/",
    "https://www.reddit.com:8443/r/sandbox/comments/abc/example/",
    "https://www.reddit.com:invalid/r/sandbox/comments/abc/example/",
    "https://www.reddit.com/r/sandbox/comments/abc/example/#fragment",
    "https://www.reddit.com/comments/def",
    "https://www.reddit.com/r/sandbox/comments/abcd/example/",
    "https://www.reddit.com/r/sandbox/comments/%61bc/example/",
    "https://www.reddit.com/r/sandbox/abc",
  ])("rejects an unsafe or wrong post URL on either side: %s", async (url) => {
    reddit.getPostsByIds.mockResolvedValueOnce({ posts: [{ ...redditPost, permalink: url }], omittedIds: [] });
    expect(await adapter.fetch([target()])).toEqual({ ok: false, error: "provider_identity_mismatch" });
    reddit.getPostsByIds.mockResolvedValueOnce({ posts: [redditPost], omittedIds: [] });
    expect(await adapter.fetch([target({ canonicalUrl: url })])).toEqual({ ok: false, error: "provider_identity_mismatch" });
  });
  it.each([
    { id: "def", name: "t3_def" }, { name: "t3_def" }, { name: "t1_abc" }, { name: undefined },
    { createdUtc: redditPost.createdUtc + 1 }, { createdUtc: undefined },
    { permalink: undefined }, { permalink: "" }, { permalink: "/comments/def" },
  ])("retains Reddit ID, fullname, publication time and permalink checks: %j", async (extra) => {
    reddit.getPostsByIds.mockResolvedValueOnce({ posts: [{ ...redditPost, ...extra }], omittedIds: [] });
    expect(await adapter.fetch([target({ canonicalUrl: "https://www.reddit.com/comments/abc" })])).toEqual({ ok: false, error: "provider_identity_mismatch" });
  });
});
