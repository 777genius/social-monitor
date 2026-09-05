import { RetainedMetricFetchAdapter } from "./retained-metric-fetch.capability";
import { HttpHackerNewsClient } from "./hacker-news/http-hacker-news-client";
import { target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";

const hnTarget = target({ externalId: "hn:123", providerKey: "hacker-news", canonicalUrl: "https://news.ycombinator.com/item?id=123" });
const story = { id: 123, type: "story", time: Date.parse(hnTarget.publishedAt) / 1000, score: 20, descendants: 5 };
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
});
