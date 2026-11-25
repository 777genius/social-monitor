import type { SummaryModelEstimate } from "../../ports";
import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import {
  extractOpenAiSummaryOutputText as extractLegacyOutput,
  parseOpenAiSummaryJsonObject,
  resolveOpenAiSummaryUsage as resolveLegacyUsage,
} from "./openai-responses-summary-response-parser";
import { extractOpenAiSummaryOutputText } from "./openai-responses-summary-output-text";
import { resolveOpenAiSummaryUsage } from "./openai-responses-summary-usage";

const estimate: SummaryModelEstimate = {
  inputTokens: 111,
  outputTokens: 222,
  estimatedCostUsd: 0.125,
};

describe("ordinary OpenAI summary response boundaries", () => {
  it("preserves the historical exports while allowing independent ownership", () => {
    expect(resolveLegacyUsage).toBe(resolveOpenAiSummaryUsage);
    expect(extractLegacyOutput).toBe(extractOpenAiSummaryOutputText);
  });

  it("keeps the budget estimate and accepts only nonnegative integer provider token usage", () => {
    expect(resolveOpenAiSummaryUsage({ usage: { input_tokens: 0, output_tokens: 15 } }, estimate))
      .toEqual({ inputTokens: 0, outputTokens: 15, estimatedCostUsd: 0.125 });
    expect(resolveOpenAiSummaryUsage({ usage: { input_tokens: -1, output_tokens: 1.5 } }, estimate))
      .toEqual(estimate);
    expect(resolveOpenAiSummaryUsage({ usage: { input_tokens: Infinity, output_tokens: "6" } }, estimate))
      .toEqual(estimate);
    expect(resolveOpenAiSummaryUsage({ usage: [] }, estimate)).toEqual(estimate);
    expect(resolveOpenAiSummaryUsage({}, estimate)).toEqual(estimate);
  });

  it("prefers a nonempty top-level output without trimming or interpreting it", () => {
    expect(extractOpenAiSummaryOutputText({
      output_text: ' { "accepted": true } ',
      output: [{ content: [{ text: "nested" }] }],
    })).toBe(' { "accepted": true } ');
    expect(extractOpenAiSummaryOutputText({ output_text: "   " })).toBeUndefined();
  });

  it("skips malformed output entries, selects the first nonblank nested text and fails closed otherwise", () => {
    expect(extractOpenAiSummaryOutputText({
      output_text: "",
      output: [null, { content: "invalid" }, { content: [null, { text: "  " }, { text: " valid " }] }],
    })).toBe(" valid ");
    expect(extractOpenAiSummaryOutputText({ output: [null, { content: [null, { text: "" }] }] }))
      .toBeUndefined();
    expect(extractOpenAiSummaryOutputText({ output: {} })).toBeUndefined();
  });

  it("retains strict JSON-object rejection and provider error classification", () => {
    expect(parseOpenAiSummaryJsonObject('{"ok":true}')).toEqual({ ok: true });
    for (const output of ["[]", "null", "not json"]) {
      try {
        parseOpenAiSummaryJsonObject(output);
        throw new Error("Expected the parser to reject a non-object JSON value");
      } catch (error) {
        expect(error).toBeInstanceOf(SummaryModelProviderError);
        expect((error as SummaryModelProviderError).failure.kind).toBe("invalid_schema");
        expect((error as SummaryModelProviderError).failure.retryable).toBe(false);
      }
    }
  });
});
