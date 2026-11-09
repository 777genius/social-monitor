import {
  SummaryModelProviderError,
  classifyOpenAiSummaryError,
} from "./openai-responses-summary-model-error";

describe("OpenAI summary failure classification", () => {
  it("retains explicit provider failure identity", () => {
    const failure = {
      kind: "provider_rate_limited" as const,
      retryable: true,
      message: "Synthetic rate limit",
    };
    expect(classifyOpenAiSummaryError(new SummaryModelProviderError(failure)))
      .toBe(failure);
  });

  it("keeps aborts retryable without leaking exception details", () => {
    const abort = new Error("synthetic transport metadata");
    abort.name = "AbortError";
    expect(classifyOpenAiSummaryError(abort)).toEqual({
      kind: "provider_unavailable",
      retryable: true,
      message: "OpenAI summary request timed out",
    });
  });

  it.each([
    ["Budget pressure", "budget_exceeded"],
    ["Citation invalid", "citation_validation_failed"],
    ["Schema mismatch", "invalid_schema"],
    ["Invalid JSON", "invalid_schema"],
    ["Other synthetic failure", "unknown"],
  ])("classifies %s without retry", (message, kind) => {
    expect(classifyOpenAiSummaryError(new Error(message))).toEqual({
      kind,
      retryable: false,
      message,
    });
  });

  it("normalizes non-error provider rejection", () => {
    expect(classifyOpenAiSummaryError(null)).toEqual({
      kind: "unknown",
      retryable: false,
      message: "Unknown summary model error",
    });
  });
});
