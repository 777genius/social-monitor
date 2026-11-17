import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import {
  completeOpenAiReaderSummaryAttempt,
  validateOpenAiReaderSummaryResponse,
} from "./openai-responses-reader-summary-response-policy";

const route: ReaderSummaryModelRoute = {
  provider: "openai-responses",
  model: "gpt-5.4-mini",
  promptVersion: "reader_summary.prompt.test",
  schemaVersion: "reader_summary.artifact.v1",
};

const complete = (
  responseJson: Record<string, unknown>,
  estimateUsage: () => never,
) => completeOpenAiReaderSummaryAttempt({
  responseJson,
  input: {} as ReaderSummaryModelInput,
  selectedRoute: route,
  estimateUsage,
  evalDatasetVersion: "reader_summary.eval.mvp.v1",
  dailyGenerationReceipt: undefined,
});

describe("OpenAI reader summary response trust policy", () => {
  it.each(["incomplete", "failed", "in_progress"])(
    "rejects a %s response despite valid-looking output JSON",
    (status) => {
      const estimateUsage = jest.fn((): never => { throw new Error("metered early"); });
      expect(() => complete({ status, output_text: '{"headline":"looks complete"}' },
        estimateUsage)).toThrow("OpenAI reader summary response did not complete");
      expect(estimateUsage).not.toHaveBeenCalled();
    },
  );

  it("rejects a provider error even if the response carries parseable JSON", () => {
    const estimateUsage = jest.fn((): never => { throw new Error("metered early"); });
    expect(() => complete({
      status: "completed",
      error: { code: "synthetic_provider_failure" },
      output_text: '{"headline":"looks complete"}',
    }, estimateUsage)).toThrow("OpenAI reader summary response reported an error");
    expect(estimateUsage).not.toHaveBeenCalled();
  });

  it("refuses missing output before estimating usage", () => {
    const estimateUsage = jest.fn((): never => { throw new Error("metered early"); });
    expect(() => complete({ output: [] }, estimateUsage)).toThrow(
      "OpenAI response did not contain reader summary output text",
    );
    expect(estimateUsage).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON before metering", () => {
    const estimateUsage = jest.fn((): never => { throw new Error("metered early"); });
    expect(() => complete({ output_text: "{" }, estimateUsage)).toThrow(
      "OpenAI reader summary output must be JSON",
    );
    expect(estimateUsage).not.toHaveBeenCalled();
  });

  it("rejects explicitly empty claim citations before metering", () => {
    const estimateUsage = jest.fn((): never => { throw new Error("metered early"); });
    expect(() => complete({
      output_text: JSON.stringify({ topStories: [{ citationIds: [] }] }),
    }, estimateUsage)).toThrow("topStory citationIds must not be empty");
    expect(estimateUsage).not.toHaveBeenCalled();
  });

  it("rejects malformed normalized drafts, even when route provider also mismatches", () => {
    const attempt = {
      route: { ...route, provider: "untrusted" },
      draft: {},
    } as unknown as ProviderReaderSummaryAttempt;
    expect(validateOpenAiReaderSummaryResponse(attempt)).toMatchObject({
      ok: false,
      failure: { kind: "invalid_schema", retryable: false },
    });
  });
});
