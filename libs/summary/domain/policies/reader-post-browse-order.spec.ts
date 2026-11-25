import { readerPostsInBrowseOrder } from "./reader-post-browse-order";

const publishedAt = "2026-11-01T12:00:00.000000Z";
const readCutoff = "2026-11-02T10:00:00.000000Z";
const post = (id: string, engagement: number) => ({ id, sourceItemId: id,
  providerKey: "x", providerFamily: "x", publishedAt,
  engagement, likeCount: engagement, engagementObservedAt: "2026-11-01T12:30:00.000000Z",
  usefulness: "useful", relevance: "central" });

describe("All posts current popularity policy", () => {
  it("uses raw X likes for manual order while retaining weighted engagement for Model", () => {
    const reposted = { ...post("reposted", 210), likeCount: 10 };
    const liked = { ...post("liked", 40), likeCount: 40 };
    const pool = [reposted, liked, post("a", 1), post("b", 2), post("c", 3)];
    expect(readerPostsInBrowseOrder(pool, "likes", readCutoff)[0]!.id).toBe("liked");
    expect(readerPostsInBrowseOrder(pool, "model", readCutoff)[0]!.id).toBe("reposted");
    expect(readerPostsInBrowseOrder(pool.map(p => ({ ...p, likeCount: 999 - p.likeCount })), "model", readCutoff)
      .map(p => p.id)).toEqual(readerPostsInBrowseOrder(pool, "model", readCutoff).map(p => p.id));
  });
  it("keeps unknown X likes last without falling back to weighted engagement", () => {
    const unknown = { ...post("unknown", 999999), likeCount: null };
    const missing = { ...post("missing", 999998), likeCount: undefined };
    const reddit = { ...post("reddit", 20), providerKey: "reddit", providerFamily: "reddit" };
    expect(readerPostsInBrowseOrder([unknown, missing, post("zero", 0), reddit], "likes", readCutoff)
      .map(p => p.id)).toEqual(["reddit", "zero", "missing", "unknown"]);
  });
  it("breaks equal-like ties by recency and identity, never reposts or Model judgments", () => {
    const a = { ...post("a", 1), likeCount: 10, usefulness: "noise" };
    const b = { ...post("b", 99999), likeCount: 10, usefulness: "important" };
    expect(readerPostsInBrowseOrder([b, a], "likes", readCutoff).map(p => p.id)).toEqual(["a", "b"]);
  });
  it("uses young real observations and next-day observations bounded by read time", () => {
    const posts = [1, 2, 3, 4, 999].map((value, i) => post(String(i), value));
    posts[4]!.engagementObservedAt = "2026-11-02T09:00:00.000000Z";
    expect(readerPostsInBrowseOrder(posts, "model", readCutoff).map(p => p.engagement))
      .toEqual([999, 4, 3, 2, 1]);
  });

  it("does not use future observations to enable a four-source cohort", () => {
    const posts = [1, 2, 3, 4, 999].map((value, i) => post(String(i), value));
    posts[4]!.engagementObservedAt = "2026-11-02T10:00:00.000001Z";
    expect(readerPostsInBrowseOrder(posts, "model", readCutoff).map(p => p.id))
      .toEqual(["0", "1", "2", "3", "4"]);
  });

  it("keeps high-like noise outside the admitted cohort and Trending outside posts", () => {
    const posts = [1, 2, 3, 4, 9].map((value, i) => post(String(i), value));
    const noise = { ...post("noise", 100000), usefulness: "noise" };
    const trending = { ...post("trending", 999999), providerKey: "github-trending-page", providerFamily: "github_radar" };
    expect(readerPostsInBrowseOrder([...posts, noise, trending], "model", readCutoff).map(p => p.id))
      .toEqual(["4", "3", "2", "1", "0", "noise"]);
    expect(readerPostsInBrowseOrder([...posts, noise, trending], "likes", readCutoff)[0]!.id)
      .toBe("noise");
  });
});
