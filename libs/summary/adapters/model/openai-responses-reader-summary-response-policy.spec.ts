import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import type { ReaderSummaryDailyGenerationInput } from "../../domain";
import { readOpenAiDailyEditorialResponse } from "./openai-responses-reader-summary-daily-editor-response";
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

  it.each([
    ["refusal", { output: [{ type: "message", content: [{ type: "refusal", refusal: "synthetic" }] }] },
      "OpenAI reader summary response was refused"],
    ["nested error", { output: [{ type: "error", error: { code: "synthetic" } }] },
      "OpenAI reader summary response reported an error"],
    ["nested incomplete", { output: [{ type: "message", status: "in_progress" }] },
      "OpenAI reader summary response did not complete"],
    ["truncated", { incomplete_details: { reason: "max_output_tokens" } },
      "OpenAI reader summary response did not complete"],
  ])("rejects %s even when aggregate output looks valid", (_caseName, envelope, message) => {
    const estimateUsage = jest.fn((): never => { throw new Error("metered early"); });
    expect(() => complete({
      status: "completed", output_text: '{"headline":"looks valid"}', ...envelope,
    }, estimateUsage)).toThrow(message);
    expect(estimateUsage).not.toHaveBeenCalled();
  });

  it.each([
    [{ output: [{ type: "message", content: [{ type: "refusal", refusal: "synthetic" }] }] },
      "Daily editorial plan response was refused"],
    [{ output: [{ type: "message", status: "in_progress" }] },
      "Daily editorial plan response did not complete"],
    [{ error: { code: "synthetic" } }, "Daily editorial plan response reported an error"],
  ])("never seals daily editor plans from an untrusted completion envelope", (patch, message) => {
    expect(() => readOpenAiDailyEditorialResponse({
      status: "completed", output_text: '{"version":"reader_summary.daily_editorial.v2"}',
      ...patch,
    }, {} as ReaderSummaryDailyGenerationInput, "synthetic prompt",
    { inputTokens: 1, outputTokens: 2, estimatedCostUsd: 0 }))
      .toThrow(message);
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
