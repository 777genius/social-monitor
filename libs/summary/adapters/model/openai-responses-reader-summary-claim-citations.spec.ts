import { assertOpenAiReaderSummaryClaimCitationIds } from "./openai-responses-reader-summary-claim-citations";

describe("OpenAI reader summary claim citation guard", () => {
  it.each([
    ["topStory", "topStories"],
    ["interestHighlight", "interestHighlights"],
    ["repeatedSignal", "repeatedSignals"],
  ] as const)("rejects an explicitly empty %s citation list", (surface, field) => {
    expect(() =>
      assertOpenAiReaderSummaryClaimCitationIds({ [field]: [{ citationIds: [] }] }),
    ).toThrow(`${surface} citationIds must not be empty`);
  });

  it("rejects an explicitly empty claim-board citation list", () => {
    expect(() =>
      assertOpenAiReaderSummaryClaimCitationIds({
        content: { claimBoard: [{ citationIds: [] }] },
      }),
    ).toThrow("readerClaim citationIds must not be empty");
  });

  it("preserves the downstream decoder's handling of absent or differently typed citations", () => {
    expect(() =>
      assertOpenAiReaderSummaryClaimCitationIds({
        topStories: [{ citationIds: undefined }, { citationIds: "c1" }],
        interestHighlights: null,
        repeatedSignals: [{ citationIds: ["c1"] }],
        content: { claimBoard: [{ citationIds: ["c1"] }] },
      }),
    ).not.toThrow();
  });

  it("does not assume model-supplied claim arrays or content are objects", () => {
    expect(() =>
      assertOpenAiReaderSummaryClaimCitationIds({
        topStories: "not an array",
        content: [],
        repeatedSignals: [null, "not an object"],
      }),
    ).not.toThrow();
  });
});
