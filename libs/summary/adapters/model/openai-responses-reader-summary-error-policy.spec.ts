import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-transport";
import { classifyOpenAiReaderSummaryModelError } from "./openai-responses-reader-summary-error-policy";

describe("OpenAI reader-summary error classification", () => {
  it("retains typed provider failures without relaxing retry policy", () => {
    const failure = { kind: "invalid_schema" as const, retryable: false, message: "synthetic" };
    expect(classifyOpenAiReaderSummaryModelError(
      new ReaderSummaryModelProviderError(failure),
    )).toEqual(failure);
  });

  it("keeps timeout distinct from parser and budget failures", () => {
    const timeout = new Error("synthetic deadline");
    timeout.name = "AbortError";
    expect(classifyOpenAiReaderSummaryModelError(timeout))
      .toMatchObject({ kind: "provider_unavailable", retryable: true });
    expect(classifyOpenAiReaderSummaryModelError(new Error("model budget exhausted")))
      .toMatchObject({ kind: "budget_exceeded", retryable: false });
    expect(classifyOpenAiReaderSummaryModelError(new Error("citation missing")))
      .toMatchObject({ kind: "citation_validation_failed", retryable: false });
    expect(classifyOpenAiReaderSummaryModelError(new Error("JSON schema mismatch")))
      .toMatchObject({ kind: "invalid_schema", retryable: false });
  });
});
