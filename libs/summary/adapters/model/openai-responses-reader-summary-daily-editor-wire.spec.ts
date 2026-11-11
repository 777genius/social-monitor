import {
  buildOpenAiDailyEditorialRequest,
  resolveOpenAiDailyEditorialUsage,
} from "./openai-responses-reader-summary-daily-editor-wire";
import { readOpenAiDailyEditorialResponse } from "./openai-responses-reader-summary-daily-editor-response";
import { dailyEditorialInstructions, dailyEditorialOutputSchema } from "./reader-summary-daily-editorial-model";
import { dailyDigestFixture } from "./reader-summary-daily-digest.fixture";
import { runOpenAiDailyEditor } from "./openai-responses-reader-summary-daily-editor";
import { readFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import type { ReaderSummaryModelRoute } from "../../ports";

it("preserves OpenAI daily-editor request/schema, no-retention, 3k estimate and bounded dispatch", () => {
  expect(buildOpenAiDailyEditorialRequest("synthetic-model", 600, "frozen")).toEqual({
    model: "synthetic-model", store: false, max_output_tokens: 600,
    instructions: dailyEditorialInstructions, input: "frozen",
    text: { format: {
      type: "json_schema", name: "social_monitor_daily_editorial_plan",
      strict: true, schema: dailyEditorialOutputSchema,
    } },
  });
  expect(buildOpenAiDailyEditorialRequest("synthetic-model", 9_000, "frozen"))
    .toMatchObject({ max_output_tokens: 3_000, store: false });
  const settings = {
    prompt: "abcdef", inputTokenDivisor: 2,
    estimatedInputCostUsdPerMillionTokens: 4,
    estimatedOutputCostUsdPerMillionTokens: 5,
  };
  expect(resolveOpenAiDailyEditorialUsage({
    ...settings, response: { usage: { input_tokens: 21, output_tokens: 9 } },
  })).toEqual({ inputTokens: 21, outputTokens: 9, estimatedCostUsd: 0.015012 });
  expect(resolveOpenAiDailyEditorialUsage({
    ...settings, response: { usage: { input_tokens: -1, output_tokens: "invalid" } },
  })).toEqual({ inputTokens: 3, outputTokens: 3_000, estimatedCostUsd: 0.015012 });
});

it("rejects an absent provider output before validating and attesting the frozen plan", async () => {
  const { input } = await dailyDigestFixture();
  expect(() => readOpenAiDailyEditorialResponse(
    {}, input.evidence.dailyGenerationInput!, "prompt",
    { inputTokens: 7, outputTokens: 2, estimatedCostUsd: 0.01 },
  )).toThrow("Daily editorial plan response is empty");
});

it("preserves exact response receipts, strict legacy rejection and paid-failure usage", async () => {
  const { input, evidence } = await dailyDigestFixture();
  const plan = { version: "reader_summary.daily_editorial.v2",
    topics: [{ title: "Specific daily development", why: "One grounded source-backed event",
      depth: "detailed", feedItemIds: [evidence.dailyGenerationInput!.selected[19]!.feedItemId] }] };
  const route = { model: "synthetic-model" } as ReaderSummaryModelRoute;
  const params = {
    input, route, maxOutputTokens: 1_500, inputTokenDivisor: 4,
    estimatedInputCostUsdPerMillionTokens: 0,
    estimatedOutputCostUsdPerMillionTokens: 0,
  };
  let capturedRequest: Record<string, unknown> | undefined;
  const success = await runOpenAiDailyEditor({
    ...params, createResponse: async (request) => {
      capturedRequest = request;
      return { output_text: JSON.stringify(plan),
        usage: { input_tokens: 11, output_tokens: 22 } };
    },
  });
  expect(capturedRequest).toMatchObject({
    model: "synthetic-model", store: false, max_output_tokens: 1_500,
  });
  expect(success.plan.version).toBe("reader_summary.daily_editorial.v2");
  expect(success.usage).toEqual({ inputTokens: 11, outputTokens: 22, estimatedCostUsd: 0 });
  expect(success.editorRequestSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(success.editorOutputSha256).toMatch(/^[a-f0-9]{64}$/);
  const failure = await runOpenAiDailyEditor({
    ...params, createResponse: async () => ({
      output_text: JSON.stringify({ ...plan, version: "reader_summary.daily_editorial.v1" }),
      usage: { input_tokens: 13, output_tokens: 14 },
    }),
  }).then(() => undefined, (error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(readFailedDailyEditorUsage(failure)).toEqual({
    inputTokens: 13, outputTokens: 14, estimatedCostUsd: 0,
  });
});
