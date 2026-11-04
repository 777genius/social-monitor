import { createHash } from "node:crypto";
import { normalizeXPost } from "./x-twitter-experimental-daily-item";
import { validatedXQuotedPost } from "./x-quoted-post";
import type { XDailyCollectedPost } from "./x-daily-collector-client.port";

const quoted = { tweetId: "100", canonicalUrl: "https://x.com/original/status/100",
  authorHandle: "original", text: "The original measured experiment.",
  publishedAt: new Date("2026-11-01T11:00:00Z") };
const parent: XDailyCollectedPost = { tweetId: "200", canonicalUrl: "https://x.com/quoting/status/200",
  authorHandle: "quoting", text: "My own measured conclusion.", publishedAt: new Date("2026-11-01T12:00:00Z"),
  metrics: { likes: 10, retweets: 1, replies: 0 }, mediaUrls: [], sourceProduct: "id_lookup",
  trendScore: 12, contentKind: "quote", quotedPost: quoted };

describe("normal X embedded source capture", () => {
  it("retains independent provenance and hash while keeping authored body and own likes", () => {
    const acquiredAt = new Date("2026-11-02T12:00:00Z");
    const item = normalizeXPost(parent, "robotics", 25, undefined, acquiredAt);
    expect(item.body).toBe(parent.text);
    expect(item.metadata?.likes).toBe(10);
    expect(item.metadata?.quotedPost).toEqual({ version: "x_quoted_post.v1",
      parentTweetId: "200", tweetId: "100", canonicalUrl: quoted.canonicalUrl,
      authorHandle: "original", publishedAt: quoted.publishedAt.toISOString(), text: quoted.text,
      availableAt: acquiredAt.toISOString(),
      bodySha256: createHash("sha256").update(quoted.text).digest("hex") });
    expect(normalizeXPost({ ...parent, quotedPost: undefined }, "robotics", 25).metadata)
      .not.toHaveProperty("quotedPost");
    expect(normalizeXPost(parent, "robotics", 25).metadata).not.toHaveProperty("quotedPost");
  });
  it.each([{ ...quoted, tweetId: "200" }, { ...quoted, canonicalUrl: "https://x.com/wrong/status/100" },
    { ...quoted, publishedAt: new Date("2026-11-02T00:00:00Z") },
    { ...quoted, canonicalUrl: "https://evil.test/original/status/100" }])("rejects unbound context", value => {
    expect(validatedXQuotedPost(value, parent.tweetId, parent.publishedAt)).toBeUndefined();
  });
});
