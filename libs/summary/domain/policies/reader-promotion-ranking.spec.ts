import { READER_PROMOTION_MIN_POPULARITY_COHORT } from "./reader-post-promotion-engagement";
import {
  READER_PROMOTION_LIMITS,
  rankReaderPromotionCandidates,
  type ReaderPromotionCandidateInput,
} from "./reader-promotion-ranking";
import { readerPromotionNewsPublisher } from "./reader-promotion-news-publisher";
import {
  READER_PROMOTION_SOURCE_REGISTRY,
  readerPromotionSourceForProviderKey,
} from "./reader-promotion-source-registry";

const published = "2026-10-21T08:00:00.000000Z";
const mature = "2026-10-21T14:00:00.000000Z";

describe("Reader promotion ranking core", () => {
  it("ranks a 984-upvote post above a 0-upvote post and the RSS item out of Top", () => {
    const result = rankReaderPromotionCandidates([
      post(1, { providerFamily: "reddit", engagement: { value: 0, observedAt: mature } }),
      post(2, { providerFamily: "rss", engagement: null }),
      post(3, { providerFamily: "reddit", engagement: { value: 984, observedAt: mature } }),
      ...[10, 20, 30].map((value, index) => post(4 + index, { providerFamily: "reddit",
        engagement: { value, observedAt: mature } })),
    ]);

    expect(ids(result.top)).toEqual([3, 6, 5, 4, 1].map(id));
    expect(result.top.map((item) => item.ranking.signalScore)).toEqual([9, 7, 5, 3, 1]);
    expect(ids(result.news)).toEqual([id(2)]);
    expect(result.news[0]!.ranking.signalScore).toBe(0);
  });

  it("gives a family below the minimum cohort no popularity at all", () => {
    // Three HN stories with 1-3 points used to get up to 5/6 and outrank an
    // important X post; with fewer than five mature posts they score 0.2.
    const hn = [1, 2, 3].map((value, index) => post(10 + index, {
      providerFamily: "hacker_news", engagement: { value, observedAt: mature } }));
    const small = rankReaderPromotionCandidates([...hn,
      post(1, { providerFamily: "x", usefulness: "important", engagement: null })]);

    expect(READER_PROMOTION_MIN_POPULARITY_COHORT).toBe(5);
    expect(ids(small.top)).toEqual([1, 10, 11, 12].map(id));
    expect(small.top[1]!.ranking).toMatchObject({ metricMature: true, popularity: null,
      signalScore: 0 });
    const full = rankReaderPromotionCandidates([...hn, ...[4, 5].map((value, index) =>
      post(13 + index, { providerFamily: "hacker_news", engagement: { value, observedAt: mature } }))]);
    expect(full.top[0]!.ranking.popularity).toEqual({ cohortSize: 5, below: 4, equal: 1 });
  });

  it("ranks a strong useful post above an important post with a weak metric", () => {
    const cohort = Array.from({ length: 8 }, (_, index) =>
      post(10 + index, { engagement: { value: 100 + index, observedAt: mature } }));
    const result = rankReaderPromotionCandidates([
      post(1, { usefulness: "useful", engagement: { value: 9_000, observedAt: mature } }),
      post(2, { usefulness: "important", engagement: { value: 0, observedAt: mature } }),
      ...cohort,
    ]);

    // useful 9000: 0.2 + 0.6 * 0.95 = 0.77; important 0: 0.4 + 0.6 * 0.05 = 0.43,
    // below useful 103 (0.47) and above useful 102 (0.41).
    expect(ids(result.top)).toEqual([1, 17, 16, 15, 14, 13, 2, 12, 11, 10].map(id));
  });

  it("keeps an important post with a strong metric above every useful post", () => {
    const result = rankReaderPromotionCandidates([
      post(1, { usefulness: "useful", engagement: { value: 1, observedAt: mature } }),
      post(2, { usefulness: "important", engagement: { value: 1_000, observedAt: mature } }),
      post(3, { usefulness: "useful", engagement: { value: 999, observedAt: mature } }),
      post(4, { usefulness: "useful", engagement: { value: 2, observedAt: mature } }),
      post(5, { usefulness: "useful", engagement: { value: 3, observedAt: mature } }),
    ]);

    // important 1000: 0.4 + 0.6 * 0.9 = 0.94; useful 999: 0.2 + 0.6 * 0.7 = 0.62.
    expect(ids(result.top)).toEqual([2, 3, 5, 4, 1].map(id));
  });

  it("puts 0 into the score for an unknown metric and shows no signal", () => {
    const result = rankReaderPromotionCandidates([
      post(1, { usefulness: "important", engagement: null }),
      post(2, { usefulness: "useful", engagement: { value: 10, observedAt: mature } }),
      post(3, { usefulness: "useful", engagement: { value: 1, observedAt: mature } }),
      ...[5, 6, 7].map((value, index) => post(4 + index, {
        engagement: { value, observedAt: mature } })),
    ]);

    // useful 6 (0.5) > important unknown 0.4 > useful 5 (0.38).
    expect(ids(result.top)).toEqual([2, 6, 5, 1, 4, 3].map(id));
    expect(result.top[3]!.ranking).toMatchObject({ metricMature: false,
      popularity: null, signalScore: 0 });
  });

  it("breaks an exactly equal score by publishedAt, then candidateId", () => {
    // In a six-post cohort the two value-5 posts have percentile 1/3:
    // 0.2 + 0.6 * 1/3 equals important-unknown 0.4 exactly (a float sum
    // would give 0.39999999999999997 and reorder them).
    const result = rankReaderPromotionCandidates([
      post(1, { usefulness: "important", engagement: null,
        publishedAt: "2026-10-21T07:00:00.000000Z" }),
      post(2, { engagement: { value: 5, observedAt: mature } }),
      post(3, { engagement: { value: 5, observedAt: mature } }),
      post(5, { engagement: { value: 1, observedAt: mature } }),
      ...[4, 6, 7].map((n) => post(n, { engagement: { value: 9, observedAt: mature } })),
    ]);

    expect(ids(result.top)).toEqual([4, 6, 7, 2, 3, 1, 5].map(id));
  });

  it("compares networks only through their own percentile", () => {
    const hn = (n: number, value: number) => post(n, { providerFamily: "hacker_news",
      engagement: { value, observedAt: mature } });
    const x = (n: number, value: number) => post(n, { providerFamily: "x",
      engagement: { value, observedAt: mature } });
    const result = rankReaderPromotionCandidates([hn(1, 1_204), hn(2, 3), x(3, 40),
      x(4, 41), x(5, 50_000), hn(6, 0), hn(7, 1), hn(8, 2), x(9, 1), x(10, 2)]);

    // HN 3 points (0.7) beats X 40 likes (0.5): only percentiles are compared.
    expect(result.top.slice(0, 5).map((item) => [item.candidateId, item.ranking.popularity]))
      .toEqual([
        [id(1), { cohortSize: 5, below: 4, equal: 1 }],
        [id(5), { cohortSize: 5, below: 4, equal: 1 }],
        [id(2), { cohortSize: 5, below: 3, equal: 1 }],
        [id(4), { cohortSize: 5, below: 3, equal: 1 }],
        [id(3), { cohortSize: 5, below: 2, equal: 1 }],
      ]);
  });

  it("treats a metric observed one microsecond before six hours as unknown", () => {
    const result = rankReaderPromotionCandidates([
      post(1, { engagement: { value: 5, observedAt: "2026-10-21T13:59:59.999999Z" } }),
      post(2, { engagement: { value: 1, observedAt: "2026-10-21T14:00:00.000000Z" } }),
      post(3, { engagement: { value: Number.NaN, observedAt: mature } }),
      ...[2, 3, 4, 5].map((value, index) => post(10 + index, {
        engagement: { value, observedAt: mature } })),
    ]);
    const watched = result.top.filter((item) => item.candidateId <= id(3));

    expect(watched.map((item) => [item.candidateId, item.ranking.metricMature]))
      .toEqual([[id(2), true], [id(1), false], [id(3), false]]);
    expect(watched[1]!.ranking.popularity).toBeNull();
  });

  it("never lets RSS into Top or ranked posts into news, whatever the metrics", () => {
    const result = rankReaderPromotionCandidates(Array.from({ length: 30 }, (_, index) =>
      post(index + 1, { providerFamily: index % 2 === 0 ? "rss" : "reddit",
        usefulness: index % 3 === 0 ? "important" : "useful",
        engagement: { value: 1_000 - index, observedAt: mature } })));

    expect(result.top.concat(result.additional)
      .every((item) => item.providerFamily === "reddit")).toBe(true);
    expect(result.news.every((item) => item.providerFamily === "rss")).toBe(true);
    expect(result.news.every((item) => item.ranking.popularity === null)).toBe(true);
  });

  it("keeps a story ranked when its news post is equally useful", () => {
    const result = rankReaderPromotionCandidates([
      post(1, { storyId: "story-a", engagement: { value: 3, observedAt: mature } }),
      post(2, { storyId: "story-a", providerFamily: "rss" }),
      post(3, { storyId: "story-b", providerFamily: "rss" }),
    ]);

    expect(ids(result.top)).toEqual([id(1)]);
    expect(ids(result.news)).toEqual([id(3)]);
    expect(result.excluded).toContainEqual({ candidateId: id(2),
      reason: "story_representative" });
  });

  it("moves a story to news when its news post is strictly more useful", () => {
    const result = rankReaderPromotionCandidates([
      post(1, { storyId: "story-a", engagement: { value: 3, observedAt: mature } }),
      post(2, { storyId: "story-a", providerFamily: "rss", usefulness: "important" }),
      post(3, { storyId: "story-b" }),
    ]);

    expect(ids(result.top)).toEqual([id(3)]);
    expect(ids(result.news)).toEqual([id(2)]);
    expect(result.excluded).toContainEqual({ candidateId: id(1),
      reason: "story_representative" });
  });

  it("returns a news-owned story to the ranked block when news is full", () => {
    const fullNews = Array.from({ length: READER_PROMOTION_LIMITS.news }, (_, index) =>
      post(100 + index, { providerFamily: "rss", usefulness: "important",
        publishedAt: "2026-10-21T09:00:00.000000Z" }));
    const result = rankReaderPromotionCandidates([
      post(1, { storyId: "story-a" }),
      post(2, { storyId: "story-a", providerFamily: "rss", usefulness: "important" }),
      ...fullNews,
    ]);

    expect(ids(result.top)).toEqual([id(1)]);
    expect(ids(result.news)).toEqual(ids(fullNews));
    expect(result.excluded).toContainEqual({ candidateId: id(2),
      reason: "story_representative" });
  });

  it("keeps one news post per real news.google.com publisher, newest first", () => {
    const google = (n: number, title: string, publishedAt: string) => post(n, {
      providerFamily: "rss", engagement: null, title, publishedAt,
      canonicalIdentity: `https://news.google.com/rss/articles/item-${n}?oc=5`,
    });
    const result = rankReaderPromotionCandidates([
      google(1, "Chip rules tighten - Reuters", "2026-10-21T08:00:00.000000Z"),
      google(2, "Fab output slows - Reuters", "2026-10-21T09:00:00.000000Z"),
      google(3, "Fab output slows - The Verge", "2026-10-21T07:00:00.000000Z"),
      google(4, "No publisher suffix", "2026-10-21T06:00:00.000000Z"),
      google(5, "Another one without suffix", "2026-10-21T05:00:00.000000Z"),
    ]);

    expect(ids(result.news)).toEqual([id(2), id(3), id(4), id(5)]);
    expect(result.excluded).toContainEqual({ candidateId: id(1),
      reason: "news_publisher_duplicate" });
  });

  it("reads the aggregator publisher from the title suffix only", () => {
    expect(readerPromotionNewsPublisher({ title: "A - B - Reuters ",
      canonicalIdentity: "https://news.google.com/rss/articles/x" })).toBe("reuters");
    expect(readerPromotionNewsPublisher({ title: "Chips - Reuters",
      canonicalIdentity: "https://example.com/a" })).toBeNull();
    expect(readerPromotionNewsPublisher({ title: " - Reuters",
      canonicalIdentity: "https://news.google.com/rss/articles/x" })).toBeNull();
  });

  // Regression: a cap of 4 per network let HN stories with 1-3 points into
  // Top while stronger X posts waited, and Top ended at 9-10 posts.
  it("fills Top strictly by order without a per-network cap", () => {
    const result = rankReaderPromotionCandidates([
      ...Array.from({ length: 13 }, (_, index) => post(index + 1, {
        providerFamily: "x", engagement: { value: 100 + index, observedAt: mature } })),
      ...[5, 4, 3, 2, 1].map((value, index) => post(20 + index, {
        providerFamily: "hacker_news", engagement: { value, observedAt: mature } })),
    ]);

    // X percentiles are (2k + 1) / 26; HN 5..1 points are 0.9, 0.7, 0.5, 0.3, 0.1.
    // A per-network cap of 7 would have stopped X at 7 Top posts.
    expect(result.top.map((item) => item.candidateId)).toEqual(
      [13, 20, 12, 11, 10, 21, 9, 8, 7, 22, 6, 5].map(id));
    expect(result.top.filter((item) => item.providerFamily === "x")).toHaveLength(9);
    expect(ids(result.additional)).toEqual([23, 4, 3, 2, 24, 1].map(id));
  });

  it("caps Top at 12, ranked at 48 and news at 16", () => {
    const families = ["x", "reddit", "hacker_news"];
    const result = rankReaderPromotionCandidates([
      ...Array.from({ length: 60 }, (_, index) => post(index + 1, {
        providerFamily: families[index % 3]!,
        engagement: { value: index, observedAt: mature } })),
      ...Array.from({ length: 20 }, (_, index) => post(index + 101, {
        providerFamily: "rss", engagement: null })),
    ]);

    expect(result.top).toHaveLength(READER_PROMOTION_LIMITS.top);
    expect(result.top.length + result.additional.length)
      .toBe(READER_PROMOTION_LIMITS.rankedTotal);
    expect(result.news).toHaveLength(READER_PROMOTION_LIMITS.news);
  });

  it("routes a newly registered unranked source to news without a policy change", () => {
    const registry = [...READER_PROMOTION_SOURCE_REGISTRY,
      { family: "mastodon", providerKeys: ["mastodon"], engagementClass: "unranked" as const }];
    const family = readerPromotionSourceForProviderKey("Mastodon", registry)!.family;
    const result = rankReaderPromotionCandidates([
      post(1, { providerFamily: family, providerKey: "mastodon",
        engagement: { value: 10_000, observedAt: mature } }),
      post(2, { engagement: { value: 1, observedAt: mature } }),
    ], registry);

    expect(ids(result.top)).toEqual([id(2)]);
    expect(ids(result.news)).toEqual([id(1)]);
    expect(() => rankReaderPromotionCandidates([post(3, { providerFamily: "mastodon" })]))
      .toThrow("not registered");
  });

  it("falls through to the next post of a story when a headline is unavailable", () => {
    const result = rankReaderPromotionCandidates([
      post(1, { storyId: "story-a", engagement: { value: 99, observedAt: mature },
        presentation: { status: "unavailable" } }),
      post(2, { storyId: "story-a", engagement: { value: 1, observedAt: mature } }),
      post(3, { storyId: "story-a", engagement: { value: 0, observedAt: mature } }),
    ]);

    expect(ids(result.top)).toEqual([id(2)]);
    expect(result.excluded).toContainEqual({ candidateId: id(3),
      reason: "story_representative" });
  });
});

const id = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const ids = (items: readonly { readonly candidateId: string }[]): string[] =>
  items.map((item) => item.candidateId);

const post = (
  n: number,
  overrides: Partial<ReaderPromotionCandidateInput> = {},
): ReaderPromotionCandidateInput => ({
  candidateId: id(n),
  providerKey: overrides.providerFamily ?? "reddit",
  providerFamily: "reddit",
  storyId: `story-${n}`,
  publishedAt: published,
  usefulness: "useful",
  relevance: "central",
  engagement: null,
  title: `Post ${n}`,
  ...overrides,
});
