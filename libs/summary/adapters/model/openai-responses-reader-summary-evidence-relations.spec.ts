import { normalizeInterestHighlights as normalizeInterestHighlightsDirect } from "./openai-responses-reader-summary-interest-highlights";
import { normalizeRepeatedSignals as normalizeRepeatedSignalsDirect } from "./openai-responses-reader-summary-repeated-signals";
import type { ReaderSummaryCitation } from "../../domain";
import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  normalizeInterestHighlights,
  normalizeRepeatedSignals,
} from "./openai-responses-reader-summary-evidence-relations";

const input = readerSummaryInput();
const citationMap = [
  { citationId: "c1", feedItemId: "feed-reddit", providerKey: "reddit" },
] as ReaderSummaryCitation[];

describe("reader summary evidence relations", () => {
  it("requires at least one known citation for a highlight", () => {
    expect(normalizeInterestHighlights(
      [{ interestId: "interest-ai", citationIds: ["unknown"] }],
      input,
      citationMap,
    )).toEqual([]);
    expect(normalizeInterestHighlights(
      [{ title: "Synthetic", citationIds: ["c1"] }],
      input,
      citationMap,
    )).toMatchObject([{
      interestId: "interest-ai",
      citationIds: ["c1"],
    }]);
  });

  it("never promotes uncited or single-interest repeated signals", () => {
    expect(normalizeRepeatedSignals(
      [{ storyClusterId: "story:agent-runtime-reader", interestIds: ["interest-ai"], citationIds: ["c1"] }],
      input,
      citationMap,
    )).toEqual([]);
    expect(normalizeRepeatedSignals(
      [{ storyClusterId: "story:agent-runtime-reader", interestIds: ["interest-ai", "interest-other"], citationIds: ["c1"] }],
      input,
      citationMap,
    )).toMatchObject([{ storyClusterId: "story:agent-runtime-reader", citationIds: ["c1"] }]);
  });

  it("retains exact legacy export identity for independent relation policies", () => {
    expect(normalizeInterestHighlights).toBe(normalizeInterestHighlightsDirect);
    expect(normalizeRepeatedSignals).toBe(normalizeRepeatedSignalsDirect);
  });

  it("binds frozen untrusted relations to known citations without mutating input", () => {
    const highlight = Object.freeze({
      interestId: "",
      title: "Verified highlight",
      citationIds: Object.freeze(["unknown", "c1"]),
    });
    const signal = Object.freeze({
      storyClusterId: "story:agent-runtime-reader",
      interestIds: Object.freeze(["interest-ai", "interest-other"]),
      citationIds: Object.freeze(["unknown", "c1"]),
    });
    expect(normalizeInterestHighlights([highlight], input, citationMap)).toMatchObject([
      { interestId: "interest-ai", citationIds: ["c1"] },
    ]);
    expect(normalizeRepeatedSignals([signal], input, citationMap)).toMatchObject([
      { storyClusterId: "story:agent-runtime-reader", citationIds: ["c1"] },
    ]);
    expect(highlight.citationIds).toEqual(["unknown", "c1"]);
    expect(signal.citationIds).toEqual(["unknown", "c1"]);
  });

  it("rejects fabricated relation evidence regardless of policy owner", () => {
    expect(normalizeInterestHighlights(
      [{ interestId: "interest-ai", citationIds: ["fabricated"] }], input, citationMap,
    )).toEqual([]);
    expect(normalizeRepeatedSignals(
      [{
        storyClusterId: "story:agent-runtime-reader",
        interestIds: ["interest-ai", "interest-other"],
        citationIds: ["fabricated"],
      }], input, citationMap,
    )).toEqual([]);
  });

});
