/**
 * Review-owned holdout labels. This file intentionally imports neither the
 * evaluator nor policy constants so threshold edits cannot rewrite the oracle.
 */
export const readerPostPromotionV1Holdout = [
  { id: "x-top-minus-one", provider: "x", likes: 29, reposts: 20,
    expected: "promote_additional" },
  { id: "x-top-exact", provider: "x", likes: 30, reposts: 20,
    expected: "promote_top" },
  { id: "x-additional-minus-one", provider: "x", likes: 14, reposts: 10,
    expected: "reject" },
  { id: "x-additional-exact", provider: "x", likes: 15, reposts: 10,
    expected: "promote_additional" },
  { id: "reddit-top-without-ratio", provider: "reddit", score: 50,
    expected: "promote_top" },
  { id: "reddit-additional-without-ratio", provider: "reddit", score: 25,
    expected: "promote_additional" },
  { id: "reddit-trusted-ratio-below", provider: "reddit", score: 25,
    ratio: 0.549_999, expected: "reject" },
  { id: "reddit-trusted-ratio-exact", provider: "reddit", score: 25,
    ratio: 0.55, expected: "promote_additional" },
  { id: "hn-additional-minus-one", provider: "hacker_news", points: 24,
    expected: "reject" },
  { id: "hn-additional-exact", provider: "hacker_news", points: 25,
    expected: "promote_additional" },
  { id: "github-48h-top-minus-one", provider: "github_radar", hours: 48,
    delta: 99, expected: "promote_additional" },
  { id: "github-48h-top-exact", provider: "github_radar", hours: 48,
    delta: 100, expected: "promote_top" },
] as const;
