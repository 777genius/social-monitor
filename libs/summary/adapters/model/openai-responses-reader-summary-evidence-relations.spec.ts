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
});
