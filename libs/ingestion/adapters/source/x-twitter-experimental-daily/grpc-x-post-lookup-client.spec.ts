import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { XCollectedPost, XPostContentKind, XSearchProduct } from
  "@social-monitor/contracts/generated/grpc/x_collector/v1/x_collector";
import { GrpcXDailyCollectorClient } from "./grpc-x-daily-collector-client";

const request = { requestId: "lookup-request", tenantId: tenantId("tenant"),
  workspaceId: workspaceId("workspace"), sourceBindingId: "binding", scanJobId: "scan",
  correlationId: "correlation", tweetIds: ["200", "201"] };
const post = (id = "200") => XCollectedPost.fromPartial({ tweetId: id,
  canonicalUrl: `https://x.com/quoting/status/${id}`, text: "My own conclusion.",
  authorHandle: "quoting", publishedAt: new Date("2026-11-01T12:00:00Z"),
  sourceProduct: XSearchProduct.X_SEARCH_PRODUCT_ID_LOOKUP, contentKind: XPostContentKind.X_POST_CONTENT_KIND_QUOTE,
  metrics: { likes: "10", retweets: "1", replies: "0", likesObserved: true, retweetsObserved: true },
  quotedPost: { tweetId: "100", canonicalUrl: "https://x.com/original/status/100",
    text: "The original experiment.", authorHandle: "original", publishedAt: new Date("2026-11-01T11:00:00Z") } });

describe("known-id normal collector gRPC boundary", () => {
  it("preserves generated quoted identity/body with scope/auth/deadline and no extra call", async () => {
    const calls: unknown[] = [];
    const client = new GrpcXDailyCollectorClient({ lookupPosts: (wire: unknown, metadata: {
      get(key: string): unknown[] }, options: { deadline: Date }, callback: (error: Error | null, response: unknown) => void) => {
      calls.push({ wire, authorization: metadata.get("authorization"), deadline: options.deadline.toISOString() });
      callback(null, { schemaVersion: 1, nextCursor: "", posts: [XCollectedPost.decode(XCollectedPost.encode(post()).finish())], warnings: [] });
    } } as never, { now: () => new Date("2026-11-02T00:00:00Z") }, { timeoutMs: 1000, serviceToken: "token-value" });
    const result = await client.lookupPosts(request);
    expect(calls).toEqual([{ wire: { ...request, schemaVersion: 1 }, authorization: ["Bearer token-value"],
      deadline: "2026-11-02T00:00:01.000Z" }]);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({ tweetId: "200", text: "My own conclusion.",
      sourceProduct: "id_lookup", metrics: { likes: 10, retweets: 1 },
      quotedPost: { tweetId: "100", text: "The original experiment.", authorHandle: "original" } });
  });
  it.each([[], ["200", "200"], ["bad"], Array.from({ length: 51 }, (_, i) => String(i + 1))].map(tweetIds => ({ tweetIds })))(
    "rejects invalid target sets before transport", async ({ tweetIds }) => {
      const lookupPosts = jest.fn();
      const client = new GrpcXDailyCollectorClient({ lookupPosts } as never,
        { now: () => new Date() }, { timeoutMs: 1000 });
      await expect(client.lookupPosts({ ...request, tweetIds })).rejects.toThrow("1-50 distinct");
      expect(lookupPosts).not.toHaveBeenCalled();
    });
  it.each([{ posts: [post("999")] }, { posts: [post(), post()] }])("rejects unrequested or duplicated response identities", async ({ posts }) => {
    const client = new GrpcXDailyCollectorClient({ lookupPosts: (_r: unknown, _m: unknown, _o: unknown,
      cb: (error: Error | null, response: unknown) => void) =>
      cb(null, { schemaVersion: 1, nextCursor: "", posts, warnings: [] }) } as never,
    { now: () => new Date() }, { timeoutMs: 1000 });
    await expect(client.lookupPosts(request)).rejects.toThrow("unrequested identity");
  });
});
