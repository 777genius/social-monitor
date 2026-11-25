import type { ReaderSummaryDailyGenerationInput } from "../../domain";
import type { ReaderSummaryModelInput, SummaryModelInput } from "../../ports";
import { openAiResponsesCompletionIssue } from "./openai-responses-completion-state";
import { readOpenAiDailyEditorialResponse } from "./openai-responses-reader-summary-daily-editor-response";
import { completeOpenAiReaderSummaryAttempt } from "./openai-responses-reader-summary-response-policy";
import { completeOpenAiSummaryAttempt } from "./openai-responses-summary-attempt-completion";

const text = '{"headline":"Synthetic text is not proof of generated output"}';
const responseWith = (output: Record<string, unknown>) => ({
  status: "completed",
  output: [output],
});
const invalidOutput = [
  ["input text", { type: "message", content: [{ type: "input_text", text }] }],
  ["unknown content", { type: "message", content: [{ type: "future_content", text }] }],
  ["untyped content", { type: "message", content: [{ text }] }],
  ["reasoning text", { type: "reasoning", content: [{ type: "output_text", text }] }],
  ["untyped output", { content: [{ type: "output_text", text }] }],
  ["user message", { type: "message", role: "user", content: [{ type: "output_text", text }] }],
] as const;

describe("generated OpenAI output admission", () => {
  it.each(invalidOutput)("rejects %s before ordinary or reader summary normalization", (_name, output) => {
    const responseJson = responseWith(output);
    const estimateUsage = jest.fn(() => ({ inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }));
    expect(openAiResponsesCompletionIssue(responseJson)).toBe("not_completed");
    expect(() => completeOpenAiSummaryAttempt({
      responseJson,
      input: {} as SummaryModelInput,
      selectedRoute: {
        provider: "openai-responses", model: "synthetic", promptVersion: "synthetic",
        schemaVersion: "summary.artifact.v1",
      },
      estimateUsage,
      evalDatasetVersion: "synthetic",
    })).toThrow("OpenAI summary response did not complete");
    expect(() => completeOpenAiReaderSummaryAttempt({
      responseJson,
      input: {} as ReaderSummaryModelInput,
      selectedRoute: {
        provider: "openai-responses", model: "synthetic", promptVersion: "synthetic",
        schemaVersion: "reader_summary.artifact.v1",
      },
      estimateUsage,
      evalDatasetVersion: "synthetic",
      dailyGenerationReceipt: undefined,
    })).toThrow("OpenAI reader summary response did not complete");
    expect(estimateUsage).not.toHaveBeenCalled();
  });

  it.each(invalidOutput)("rejects %s before sealing a daily editorial plan", (_name, output) => {
    expect(() => readOpenAiDailyEditorialResponse(
      responseWith(output), {} as ReaderSummaryDailyGenerationInput, "synthetic prompt",
      { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
    )).toThrow("Daily editorial plan response did not complete");
  });

  it("rejects conflicting typed text even with a valid aggregate or generated sibling", () => {
    const content = [{ type: "input_text", text }, { type: "output_text", text }];
    const response = responseWith({ type: "message", content });
    expect(openAiResponsesCompletionIssue({ ...response, output_text: text }))
      .toBe("not_completed");
  });

  it("preserves generated assistant output, reasoning metadata and legacy statusless fixtures", () => {
    const response = responseWith({
      type: "message", role: "assistant", content: [{ type: "output_text", text }],
    });
    expect(openAiResponsesCompletionIssue({
      ...response, output: [{ type: "reasoning", summary: [] }, ...response.output],
    })).toBeNull();
    expect(openAiResponsesCompletionIssue({ output: [{ content: [{ text }] }] })).toBeNull();
    expect(openAiResponsesCompletionIssue({ output_text: text })).toBeNull();
  });
});
