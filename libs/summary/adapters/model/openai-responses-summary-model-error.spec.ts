import { SummaryModelProviderError as directProviderError } from './openai-responses-summary-provider-error';
import { classifyOpenAiSummaryError as directClassifier } from './openai-responses-summary-error-classification';
import {
  SummaryModelProviderError,
  classifyOpenAiSummaryError,
} from "./openai-responses-summary-model-error";

describe("OpenAI summary failure classification", () => {
  it("keeps historical and direct specialist imports as the same exported objects", () => {
    expect(SummaryModelProviderError).toBe(directProviderError);
    expect(classifyOpenAiSummaryError).toBe(directClassifier);
  });

  it.each([
    ["citation schema budget", "budget_exceeded"],
    ["schema citation", "citation_validation_failed"],
    ["JSON schema", "invalid_schema"],
  ])("keeps exact classification precedence for %s", (message, kind) => {
    expect(classifyOpenAiSummaryError(new Error(message))).toEqual({
      kind,
      retryable: false,
      message,
    });
  });

  it("preserves pre-classified provider failures ahead of abort and text heuristics", () => {
    const failure = { kind: "invalid_schema" as const, retryable: false, message: "Synthetic citation budget" };
    const providerError = new SummaryModelProviderError(failure);
    providerError.name = "AbortError";
    expect(classifyOpenAiSummaryError(providerError)).toBe(failure);
  });

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
