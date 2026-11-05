import { normalizeItem, rssWarnings } from "./rss-source-item-mapping";

describe("RSS source-item canonical identity", () => {
  const feedUrl = "https://feeds.example.net/updates/feed.xml";
  const entry = {
    title: "Article",
    content: "Readable summary",
    publishedAt: new Date("2026-07-09T08:00:00.000Z"),
    link: "../posts/42",
  };

  it("resolves relative Atom links against the feed URL", () => {
    const result = normalizeItem(entry, 0, feedUrl);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      canonicalUrl: "https://feeds.example.net/posts/42",
      externalId: expect.stringMatching(
        /^https:\/\/feeds\.example\.net\/posts\/42#rss2-[0-9a-f]{24}$/,
      ),
    });
  });

  it("keeps GUID-less item identity stable across feed reordering", () => {
    const early = normalizeItem(entry, 0, feedUrl);
    const reordered = normalizeItem(entry, 7, feedUrl);
    expect(reordered[0]?.externalId).toBe(early[0]?.externalId);
    expect(normalizeItem({ ...entry, guid: "stable-guid" }, 7, feedUrl)[0]?.externalId)
      .toBe("stable-guid");
  });

  it("does not merge distinct GUID-less entries that share one canonical URL", () => {
    const first = normalizeItem(entry, 0, feedUrl)[0];
    const second = normalizeItem({ ...entry, title: "Different article" }, 1, feedUrl)[0];
    expect(first?.externalId).not.toBe(second?.externalId);
    expect(first?.canonicalUrl).toBe(second?.canonicalUrl);
    expect(normalizeItem(entry, 8, feedUrl)[0]?.externalId).toBe(first?.externalId);
  });

  it("reports missing canonical links only for readable timestamped entries", () => {
    const now = new Date("2026-07-09T08:00:00.000Z");
    expect(rssWarnings([
      { item: { title: "Readable", publishedAt: now, guid: "missing-link" }, feedUrl },
      { item: { title: "Readable", guid: "missing-time" }, feedUrl },
      { item: { title: "", content: "", publishedAt: now, guid: "unreadable" }, feedUrl },
    ])).toEqual([
      "Some RSS items had no published timestamp; they were skipped.",
      "Some RSS items had no canonical link; they were skipped.",
    ]);
  });

  it("reports a readable timestamped entry with an invalid non-HTTP link", () => {
    expect(rssWarnings([{ item: { ...entry, link: "javascript:alert(1)" }, feedUrl }]))
      .toEqual(["Some RSS items had no canonical link; they were skipped."]);
  });

  it("does not accept a non-HTTP link as a canonical URL", () => {
    expect(normalizeItem({ ...entry, link: "javascript:alert(1)" }, 0, feedUrl))
      .toEqual([]);
  });
});
