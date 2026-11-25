import { parseOpenAiReaderSummaryJsonObject as directParseOpenAiReaderSummaryJsonObject, OpenAiReaderSummaryOutputParseError as DirectOpenAiReaderSummaryOutputParseError } from "./openai-responses-reader-summary-output-json-admission";
import { extractOpenAiOutputText as ownedOpenAiOutputText } from "./openai-responses-reader-summary-output-text";
import { extractOpenAiOutputText as modelSupportOpenAiOutputText } from "./openai-responses-reader-summary-model-support";
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

  it("retains legacy and model-support extraction identities", () => {
    expect(extractOpenAiOutputText).toBe(ownedOpenAiOutputText);
    expect(modelSupportOpenAiOutputText).toBe(ownedOpenAiOutputText);
  });

  it("keeps empty and malformed provider envelopes fail-closed", () => {
    expect(ownedOpenAiOutputText({})).toBeUndefined();
    expect(ownedOpenAiOutputText({ output_text: " ", output: [{ content: [{ text: " " }] }] })).toBeUndefined();
    expect(ownedOpenAiOutputText({ output_text: false, output: [{ content: [{ text: "nested" }] }] })).toBe("nested");
    expect(() => ownedOpenAiOutputText({ output_text: " ", output: [{ content: {} }] }))
      .toThrow("OpenAI content must be an array");
    expect(() => ownedOpenAiOutputText({ output_text: " ", output: {} }))
      .toThrow("OpenAI output must be an array");
  });

  it("preserves JSON object rejection and wrapped parse errors", () => {
    expect(parseOpenAiReaderSummaryJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(() => parseOpenAiReaderSummaryJsonObject("[]")).toThrow(OpenAiReaderSummaryOutputParseError);
    expect(() => parseOpenAiReaderSummaryJsonObject("{")).toThrow(OpenAiReaderSummaryOutputParseError);
    const secret = "PRIVATE_READER_SOURCE_DO_NOT_LOG";
    let rejected: unknown;
    try { parseOpenAiReaderSummaryJsonObject(secret); } catch (error) { rejected = error; }
    expect(rejected).toBeInstanceOf(OpenAiReaderSummaryOutputParseError);
    expect((rejected as OpenAiReaderSummaryOutputParseError).detail).toBe("malformed JSON");
    expect((rejected as Error).message).not.toContain(secret);
  });


  it("preserves direct admission identity and rejects non-object provider roots without publishing", () => {
    expect(parseOpenAiReaderSummaryJsonObject).toBe(directParseOpenAiReaderSummaryJsonObject);
    expect(OpenAiReaderSummaryOutputParseError).toBe(DirectOpenAiReaderSummaryOutputParseError);
    expect(directParseOpenAiReaderSummaryJsonObject('{"one":1}')).toEqual({ one: 1 });
    for (const value of ["null", "[]", '"text"', "42", "true"]) {
      expect(() => directParseOpenAiReaderSummaryJsonObject(value))
        .toThrow(DirectOpenAiReaderSummaryOutputParseError);
    }
  });

  it("keeps syntax failures redacted and deterministic at the dedicated JSON boundary", () => {
    const raw = '{"secret":"UNTRUSTED_PRIVATE_EVIDENCE"';
    const parse = () => {
      try { directParseOpenAiReaderSummaryJsonObject(raw); } catch (error) {
        return error as DirectOpenAiReaderSummaryOutputParseError;
      }
      throw new Error("Malformed JSON was unexpectedly accepted");
    };
    const first = parse();
    const second = parse();
    expect(first.detail).toBe("malformed JSON");
    expect(first.message).toBe("OpenAI reader summary output must be JSON: malformed JSON");
    expect(first.message).toBe(second.message);
    expect(first.message).not.toContain("UNTRUSTED_PRIVATE_EVIDENCE");
    expect(raw).toContain("UNTRUSTED_PRIVATE_EVIDENCE");
  });

});
