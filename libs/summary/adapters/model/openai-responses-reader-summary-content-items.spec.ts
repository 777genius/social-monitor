import type { ReaderSummaryCitation } from "../../domain";
import {
  normalizeNextAction,
  normalizeReaderInterestSection,
  normalizeReaderItem,
} from "./openai-responses-reader-summary-content-items";

const citation: ReaderSummaryCitation = {
  citationId: "c1",
  feedItemId: "feed-reddit",
  sourceItemId: "source-reddit",
  providerKey: "reddit",
  field: "title",
  canonicalUrl: "https://example.test/source",
};
const citations = new Map([["c1", citation]]);

describe("Reader brief citation-backed item projection", () => {
  it("never trusts a generated provider or URL over a known citation", () => {
    const item = normalizeReaderItem({
      title: "Synthetic story",
      providerKey: "invented-provider",
      canonicalUrl: "https://example.test/untrusted",
      reason: "Synthetic reason",
      signalScore: 2,
      citationIds: ["c1"],
    }, citations);
    expect(item).toMatchObject({
      providerKey: "reddit",
      providerName: "reddit",
      canonicalUrl: "https://example.test/source",
      matchedInterestIds: ["unknown-interest"],
      matchedRules: ["provider:reddit"],
      confidence: { level: "medium", score: 0.5 },
    });
  });

  it("projects nested reader items through the same evidence policy", () => {
    const section = normalizeReaderInterestSection({
      title: "AI",
      insight: "Synthetic",
      items: [{
        title: "Source discussion", providerKey: "invented", reason: "Synthetic",
        citationIds: ["c1"],
      }],
      citationIds: ["c1"],
    }, citations);
    expect(section.items[0]?.providerKey).toBe("reddit");
    expect(section.citationIds).toEqual(["c1"]);
  });

  it("retains citation-derived next action URLs and rejects malformed item fields", () => {
    const action = normalizeNextAction({
      label: "Read original",
      reason: "Verify synthetic story",
      citationIds: ["c1"],
      canonicalUrl: "https://example.test/untrusted",
    }, citations);
    expect(action).toMatchObject({
      kind: "read_source",
      canonicalUrl: "https://example.test/source",
    });
    expect(() => normalizeReaderItem({ title: "Missing reason", citationIds: ["c1"] }, citations))
      .toThrow();
  });
});
