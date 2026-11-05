import { HttpRedditClient } from "./http-reddit-client";

const post = (id: string, extra = {}) => ({ kind: "t3", data: { id, name: `t3_${id}`, score: 12, num_comments: 3, ...extra } });
describe("Reddit retained post lookup HTTP contract", () => {
  const client = new HttpRedditClient();
  const request = (ids: string[]) => client.getPostsByIds({ ids, accessToken: "raw-token" });
  let fetchMock: jest.SpyInstance;
  beforeEach(() => { fetchMock = jest.spyOn(globalThis, "fetch"); });
  afterEach(() => jest.restoreAllMocks());
  it("normalizes bare/fullname IDs, uses OAuth api/info once, and reports omission", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { children: [post("abc")] } })));
    await expect(request(["abc", "t3_def"])).resolves.toMatchObject({ posts: [{ id: "abc", name: "t3_abc", score: 12 }], omittedIds: ["t3_def"] });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://oauth.reddit.com/api/info?id=t3_abc%2Ct3_def&raw_json=1");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers.authorization).toBe("Bearer raw-token");
  });
  it.each([["abc", "t3_abc"], ["t1_abc"], [], Array.from({ length: 101 }, (_, i) => `a${i}`)])("rejects invalid/duplicate/unbounded input %j before HTTP", async (...ids) => {
    await expect(request(ids as string[])).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [post("abc"), post("abc")], [post("def")], [{ ...post("abc"), kind: "t1" }],
    [post("abc", { name: "t3_def" })], [post("abc", { score: "12" })], [post("abc", { num_comments: -1 })],
  ])("rejects unexpected/duplicate/wrong kind or malformed metrics", async (...children) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { children } })));
    await expect(request(["abc"])).rejects.toThrow();
  });
  it("does not retry 429", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    await expect(request(["abc"])).rejects.toThrow("429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("accounts an empty listing as omitted and rejects a malformed listing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { children: [] } })))
      .mockResolvedValueOnce(new Response("null"));
    await expect(request(["abc"])).resolves.toEqual({ posts: [], omittedIds: ["t3_abc"] });
    await expect(request(["abc"])).rejects.toThrow();
  });
});
