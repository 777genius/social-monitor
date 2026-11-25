import { assertOpenAiReaderSummaryClaimCitationIds } from "./openai-responses-reader-summary-response-parser";

describe("OpenAI reader-summary claim citations", () => {
  it.each([
    ["topStory", { topStories: [{ citationIds: [] }] }],
    ["interestHighlight", { interestHighlights: [{ citationIds: [] }] }],
    ["repeatedSignal", { repeatedSignals: [{ citationIds: [] }] }],
    ["readerClaim", { content: { claimBoard: [{ citationIds: [] }] } }],
  ])("rejects an empty %s citationIds array", (surface, raw) => {
    expect(() => assertOpenAiReaderSummaryClaimCitationIds(raw)).toThrow(
      `${surface} citationIds must not be empty`,
    );
  });

  it("accepts non-empty claim citations", () => {
    expect(() =>
      assertOpenAiReaderSummaryClaimCitationIds({
        topStories: [{ citationIds: ["citation:top"] }],
        interestHighlights: [{ citationIds: ["citation:interest"] }],
        repeatedSignals: [{ citationIds: ["citation:repeat"] }],
        content: { claimBoard: [{ citationIds: ["citation:claim"] }] },
      }),
    ).not.toThrow();
  });
});
