import type { ReaderSummaryCitation } from "../../domain";
import { normalizeNextAction as normalizeNextActionPolicy } from "./openai-responses-reader-summary-next-action-normalization";
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

  it("retains identical legacy export and prioritizes first known trusted action citation", () => {
    expect(normalizeNextAction).toBe(normalizeNextActionPolicy);
    const second: ReaderSummaryCitation = Object.freeze({
      ...citation,
      citationId: "c2",
      canonicalUrl: "https://example.test/other",
    });
    const twoCitations = new Map([["c1", citation], ["c2", second]]);
    const proposal = Object.freeze({
      kind: "read_source",
      label: "  Read the source  ",
      reason: " Verify the claim ",
      citationIds: Object.freeze(["untrusted", "c2", "c1"]),
      canonicalUrl: "https://example.test/spoofed",
    });
    const result = normalizeNextActionPolicy(proposal, twoCitations);
    expect(result).toEqual({
      kind: "read_source",
      label: "Read the source",
      reason: "Verify the claim",
      citationIds: ["untrusted", "c2", "c1"],
      canonicalUrl: "https://example.test/other",
    });
    expect(proposal.citationIds).toEqual(["untrusted", "c2", "c1"]);
    expect(normalizeNextAction(proposal, twoCitations)).toEqual(result);
  });

  it("never accepts untrusted action URLs or invalid kinds as trusted provenance", () => {
    const action = Object.freeze({
      label: "Read more",
      reason: "Verify details",
      citationIds: Object.freeze(["unknown"]),
      canonicalUrl: "https://example.test/forged",
    });
    expect(normalizeNextActionPolicy(action, citations)).toEqual({
      kind: "read_source",
      label: "Read more",
      reason: "Verify details",
      citationIds: ["unknown"],
      canonicalUrl: undefined,
    });
    expect(() => normalizeNextActionPolicy({
      ...action,
      kind: "unsupported_action_kind",
    }, citations)).toThrow("Unsupported next action kind");
    expect(() => normalizeNextActionPolicy({
      ...action,
      citationIds: ["c1", 123],
    }, citations)).toThrow("next action citations must be a non-empty string");
  });

});
