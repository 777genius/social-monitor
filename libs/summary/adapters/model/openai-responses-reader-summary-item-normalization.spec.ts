import type { ReaderSummaryCitation } from "../../domain";
import { findTrustedReaderCitation } from "./openai-responses-reader-summary-citation-binding";
import { normalizeReaderItem } from "./openai-responses-reader-summary-item-normalization";
import { normalizeReaderItem as normalizeFromLegacy, normalizeNextAction } from "./openai-responses-reader-summary-content-items";

const original: ReaderSummaryCitation = {
  citationId: "known-1", feedItemId: "item-1", sourceItemId: "source-1",
  providerKey: "source-one", field: "title", canonicalUrl: "https://example.test/one",
};
const secondary: ReaderSummaryCitation = {
  ...original, citationId: "known-2", feedItemId: "item-2",
  sourceItemId: "source-2", providerKey: "source-two",
  canonicalUrl: "https://example.test/two",
};
const known = new Map([[original.citationId, original], [secondary.citationId, secondary]]);
const rawItem = {
  title: "Synthetic coverage", providerKey: "untrusted-source",
  reason: "A synthetic item", citationIds: ["missing", "known-2", "known-1"],
  canonicalUrl: "https://example.test/untrusted",
  signalScore: 2, providerMetrics: [{ label: "Signal", value: "2" }],
};

describe("OpenAI reader summary item ownership and citation binding", () => {
  it("selects first recognized citation, ignoring unknown earlier identifiers", () => {
    expect(findTrustedReaderCitation(rawItem.citationIds, known)).toBe(secondary);
    expect(findTrustedReaderCitation(["absent"], known)).toBeUndefined();
  });

  it("retains the legacy item export and trusts citation provider/URL over generated fields", () => {
    const expected = normalizeFromLegacy(rawItem, known);
    const actual = normalizeReaderItem(rawItem, known);
    expect(actual).toEqual(expected);
    expect(actual).toMatchObject({
      providerKey: "source-two", providerName: "source-two",
      canonicalUrl: "https://example.test/two",
      confirmedProviderKeys: ["source-two"],
      providerMetrics: [{ label: "Signal", value: "2" }],
      confidence: { level: "medium", score: 0.5 },
    });
  });

  it("keeps action and item citation priority identical", () => {
    const action = normalizeNextAction({
      label: "Read source", reason: "Synthetic check",
      citationIds: rawItem.citationIds,
      canonicalUrl: "https://example.test/untrusted",
    }, known);
    expect(action.canonicalUrl).toBe(normalizeReaderItem(rawItem, known).canonicalUrl);
    expect(action.canonicalUrl).toBe("https://example.test/two");
  });

  it("preserves unknown-citation fallback and strict required-field rejection", () => {
    const fallback = normalizeReaderItem({ ...rawItem, citationIds: ["missing"] }, known);
    expect(fallback.providerKey).toBe("untrusted-source");
    expect(fallback.canonicalUrl).toBeUndefined();
    expect(() => normalizeReaderItem({ title: "No provider", reason: "Synthetic", citationIds: ["missing"] }, known)).toThrow();
    expect(() => normalizeReaderItem({ ...rawItem, citationIds: "known-1" }, known)).toThrow();
  });
});
