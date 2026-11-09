import { resolveOpenAiReaderSummaryUsage } from "./openai-responses-reader-summary-usage";
import type { ReaderSummaryModelEstimate } from "../../ports";

const estimate: ReaderSummaryModelEstimate = {
  inputTokens: 101,
  outputTokens: 202,
  estimatedCostUsd: 0.35,
};

describe("OpenAI reader summary usage mapping", () => {
  it("keeps the route's estimated cost while accepting finite provider token counts", () => {
    expect(resolveOpenAiReaderSummaryUsage({
      usage: { input_tokens: 0, output_tokens: 345 },
    }, estimate)).toEqual({
      inputTokens: 0, outputTokens: 345, estimatedCostUsd: 0.35,
    });
  });

  it.each([NaN, Infinity, -1, "90", null, undefined])(
    "falls back for invalid token counts: %s",
    (invalid) => {
      expect(resolveOpenAiReaderSummaryUsage({
        usage: { input_tokens: invalid, output_tokens: invalid },
      }, estimate)).toEqual({
        inputTokens: 101, outputTokens: 202, estimatedCostUsd: 0.35,
      });
    },
  );

  it("falls back when provider usage is missing or not a record", () => {
    expect(resolveOpenAiReaderSummaryUsage({
      usage: [1, 2],
    }, estimate)).toEqual(estimate);
    expect(resolveOpenAiReaderSummaryUsage({}, estimate)).toEqual(estimate);
  });
});
