import {
  OpenAiReaderSummaryWeeklyModelError,
  type OpenAiReaderSummaryWeeklyModelFailure,
} from "./openai-responses-reader-summary-weekly-response-contract";
import { classifyOpenAiReaderSummaryWeeklyError } from "./openai-responses-reader-summary-weekly-failure-policy";
import { OpenAiReaderSummaryWeeklyOutputParseError } from "./openai-responses-reader-summary-weekly-response-parser";

describe("weekly model failure taxonomy", () => {
  it("preserves a provider-classified failure object without changing retryability", () => {
    const failure: OpenAiReaderSummaryWeeklyModelFailure = {
      kind: "refusal",
      retryable: false,
      message: "OpenAI reader summary weekly response was refused",
    };
    const error = new OpenAiReaderSummaryWeeklyModelError(failure);

    expect(classifyOpenAiReaderSummaryWeeklyError(error)).toBe(failure);
  });

  it("classifies strict parsed-output rejection as non-retryable", () => {
    const error = new OpenAiReaderSummaryWeeklyOutputParseError("citation mismatch");

    expect(classifyOpenAiReaderSummaryWeeklyError(error)).toEqual({
      kind: "output_validation",
      retryable: false,
      message: error.message,
    });
  });

  it.each(["AbortError", "TimeoutError"])(
    "retains the retryable deadline classification for %s",
    (name) => {
      const error = new Error("simulated timeout");
      error.name = name;

      expect(classifyOpenAiReaderSummaryWeeklyError(error)).toEqual({
        kind: "timeout",
        retryable: true,
        message: "OpenAI reader summary weekly request timed out",
      });
    },
  );

  it("keeps unknown ordinary errors non-retryable with their original message", () => {
    expect(classifyOpenAiReaderSummaryWeeklyError(new Error("synthetic failure"))).toEqual({
      kind: "unknown",
      retryable: false,
      message: "synthetic failure",
    });
  });

  it("does not stringify an untrusted thrown object into diagnostics", () => {
    expect(classifyOpenAiReaderSummaryWeeklyError({ credential: "fixture-only" })).toEqual({
      kind: "unknown",
      retryable: false,
      message: "Unknown OpenAI reader summary weekly model failure",
    });
  });
});
