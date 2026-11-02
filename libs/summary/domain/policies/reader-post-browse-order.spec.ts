import { readerPostsInBrowseOrder } from "./reader-post-browse-order";

const publishedAt = "2026-11-01T12:00:00.000000Z";
const readCutoff = "2026-11-02T10:00:00.000000Z";
const post = (id: string, engagement: number) => ({ id, sourceItemId: id,
  providerKey: "x", providerFamily: "x", publishedAt,
  engagement, engagementObservedAt: "2026-11-01T12:30:00.000000Z",
  usefulness: "useful", relevance: "central" });

describe("All posts current popularity policy", () => {
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
