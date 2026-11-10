import type { ReaderSummaryModelInput } from "../../ports";
import {
  normalizeReaderSummaryStoryLimit as legacyStoryLimit,
  selectProviderDiverseRankedEvidence as legacyProviderSelection,
} from "./deterministic-reader-summary-evidence-selection";
import {
  normalizeReaderSummaryStoryLimit,
  selectProviderDiverseRankedEvidence,
} from "./deterministic-reader-summary-provider-diversity";

type SelectedEvidence = ReaderSummaryModelInput["evidence"]["selectedEvidence"];

const evidence = (
  ...entries: readonly (readonly [string, string])[]
): SelectedEvidence =>
  entries.map(([feedItemId, providerKey]) => ({
    feedItemId,
    providerKey,
  })) as unknown as SelectedEvidence;

describe("deterministic reader summary provider diversity policy", () => {
  it("preserves legacy exports and the exact 1..20 story-limit policy", () => {
    expect(legacyProviderSelection).toBe(selectProviderDiverseRankedEvidence);
    expect(legacyStoryLimit).toBe(normalizeReaderSummaryStoryLimit);
    expect([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN].map(
      normalizeReaderSummaryStoryLimit,
    )).toEqual([1, 1, 1, 1, 1]);
    expect(normalizeReaderSummaryStoryLimit(20)).toBe(20);
    expect(normalizeReaderSummaryStoryLimit(21)).toBe(20);
  });

  it("replaces the last redundant provider and restores ranked input order", () => {
    const selected = selectProviderDiverseRankedEvidence(
      evidence(["a", "rss"], ["b", "rss"], ["c", "github"], ["d", "reddit"]),
      3,
    );
    expect(selected.map((item) => item.feedItemId)).toEqual(["a", "c", "d"]);
    expect(selected.map((item) => item.providerKey)).toEqual([
      "rss", "github", "reddit",
    ]);
  });

  it("keeps a full unique-provider first page when it cannot evict a singleton", () => {
    const selected = selectProviderDiverseRankedEvidence(
      evidence(["a", "rss"], ["b", "github"], ["c", "reddit"], ["d", "hn"]),
      3,
    );
    expect(selected.map((item) => item.feedItemId)).toEqual(["a", "b", "c"]);
  });

  it("preserves the short-page and capped-provider deterministic fallbacks", () => {
    const shortPage = evidence(["a", "rss"], ["b", "rss"]);
    expect(selectProviderDiverseRankedEvidence(shortPage, 3))
      .toEqual(shortPage);

    const selected = selectProviderDiverseRankedEvidence(
      evidence(["a", "rss"], ["b", "rss"], ["c", "github"], ["d", "reddit"]),
      2,
    );
    expect(selected.map((item) => item.feedItemId)).toEqual(["a", "c"]);
  });
});
