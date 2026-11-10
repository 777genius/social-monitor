import {
  extractOpenAiOutputText,
  OpenAiReaderSummaryOutputParseError,
  parseOpenAiReaderSummaryJsonObject,
} from "./openai-responses-reader-summary-response-parser";

describe("OpenAI reader summary response parsing", () => {
  it("prioritizes a nonblank top-level output_text over nested text", () => {
    expect(extractOpenAiOutputText({
      output_text: "  direct  ",
      output: [{ content: [{ text: "nested" }] }],
    })).toBe("  direct  ");
  });

  it("accepts nested text while preserving the fail-closed array structure", () => {
    expect(extractOpenAiOutputText({
      output_text: " ",
      output: [{ content: [{ text: "" }, { text: "nested" }] }],
    })).toBe("nested");
    expect(() => extractOpenAiOutputText({ output: {} })).toThrow("OpenAI output must be an array");
    expect(() => extractOpenAiOutputText({ output: [{ content: {} }] })).toThrow("OpenAI content must be an array");
  });

  it("preserves JSON object rejection and wrapped parse errors", () => {
    expect(parseOpenAiReaderSummaryJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(() => parseOpenAiReaderSummaryJsonObject("[]")).toThrow(OpenAiReaderSummaryOutputParseError);
    expect(() => parseOpenAiReaderSummaryJsonObject("{")).toThrow(OpenAiReaderSummaryOutputParseError);
  });
});
