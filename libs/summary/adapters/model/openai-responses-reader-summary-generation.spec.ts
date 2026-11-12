import type { ReaderSummaryModelRoute } from "../../ports";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";
import { readerSummaryWriterSchema } from "./openai-responses-reader-summary-schema";
import { readerSummaryInput, validReaderProviderDraft } from "./agent-runtime-reader-summary-model.spec-support";
import { runOpenAiReaderSummaryGeneration } from "./openai-responses-reader-summary-generation";

const route: ReaderSummaryModelRoute = {
  provider: "openai-responses",
  model: "gpt-5.4-mini",
  promptVersion: "reader_summary.prompt.test",
  schemaVersion: "reader_summary.artifact.v1",
};
const usage = () => ({
  inputTokens: 120,
  outputTokens: 60,
  estimatedCostUsd: 0.001,
});

describe("OpenAI reader-summary generation boundary", () => {
  it("builds the exact strict provider contract and normalizes grounded usage", async () => {
    const input = readerSummaryInput();
    const requests: Record<string, unknown>[] = [];
    const attempt = await runOpenAiReaderSummaryGeneration({
      input,
      selectedRoute: route,
      maxOutputTokens: 1_024,
      evalDatasetVersion: "test-eval",
      estimateUsage: usage,
      createResponse: async (request) => {
        requests.push(request);
        return {
          output_text: JSON.stringify(validReaderProviderDraft()),
          usage: { input_tokens: 99, output_tokens: 25 },
        };
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: route.model,
      store: false,
      max_output_tokens: 1_024,
      text: {
        format: {
          type: "json_schema",
          name: "social_monitor_reader_summary_artifact",
          strict: true,
        },
      },
    });
    expect(requests[0]?.input).toBe(buildOpenAiReaderSummaryPromptPayload(input));
    expect(requests[0]?.instructions).toBe(buildOpenAiReaderSummaryInstructions(input));
    const format = (requests[0]?.text as { format: { schema: unknown } }).format;
    expect(format.schema).toEqual(readerSummaryWriterSchema(input));
    expect(attempt.route).toBe(route);
    expect(attempt.draft.usage).toMatchObject({ inputTokens: 99, outputTokens: 25 });
    expect(attempt.dailyGenerationReceipt).toBeUndefined();
  });

  it("rejects a response with no output text without estimating invented usage", async () => {
    const estimateUsage = jest.fn(usage);
    const createResponse = jest.fn(async () => ({}));
    await expect(runOpenAiReaderSummaryGeneration({
      input: readerSummaryInput(),
      selectedRoute: route,
      maxOutputTokens: 1_024,
      evalDatasetVersion: "test-eval",
      estimateUsage,
      createResponse,
    })).rejects.toMatchObject({
      failure: { kind: "unsafe_or_refused", retryable: false },
    });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(estimateUsage).not.toHaveBeenCalled();
  });

  it("preserves transport failure identity and never retries behind the adapter", async () => {
    const transportFailure = new Error("synthetic transport failure");
    const estimateUsage = jest.fn(usage);
    const createResponse = jest.fn(async (): Promise<Record<string, unknown>> => {
      throw transportFailure;
    });
    await expect(runOpenAiReaderSummaryGeneration({
      input: readerSummaryInput(),
      selectedRoute: route,
      maxOutputTokens: 1_024,
      evalDatasetVersion: "test-eval",
      estimateUsage,
      createResponse,
    })).rejects.toBe(transportFailure);
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(estimateUsage).not.toHaveBeenCalled();
  });
});
