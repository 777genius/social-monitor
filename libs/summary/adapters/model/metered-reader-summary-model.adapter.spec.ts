import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import type { ReaderSummaryModelPort } from "../../ports";
import { dailyEditorialCoveragePlan, validateDailyEditorialPlan } from "../../domain";
import { generateReaderSummaryWithDailyEditor } from "../../features/execute-reader-summary-job/reader-summary-daily-editorial-generation";
import { MeteredReaderSummaryModelAdapter } from "./metered-reader-summary-model.adapter";
import { OpenAiResponsesReaderSummaryModelAdapter } from "./openai-responses-reader-summary-model.adapter";
import { dailyDigestFixture, dailyProviderDraft } from "./reader-summary-daily-digest.fixture";
import { jsonResponse } from "./reader-summary-model-promotion.spec-support";

it("preserves editor capability and the residual writer budget through the runtime metrics decorator", async () => {
  const { input } = await dailyDigestFixture();
  const plan = validateDailyEditorialPlan({ version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Later important development", why: "Practical importance",
      depth: "detailed", feedItemIds: [input.evidence.dailyGenerationInput!.selected[19]!.feedItemId] }],
  }, input.evidence.dailyGenerationInput!);
  const writerInput = { ...input, dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, input.evidence),
    policy: { ...input.policy, maxStories: 1 } };
  let calls = 0;
  const delegate = new OpenAiResponsesReaderSummaryModelAdapter({ apiKey: "fixture-only-key",
    fetchFn: async () => jsonResponse({ output_text: JSON.stringify(
      ++calls === 1 ? plan : dailyProviderDraft(writerInput)),
    usage: { input_tokens: 100, output_tokens: 50 } }),
  });
  const typedDelegate: ReaderSummaryModelPort = delegate;
  const generate = jest.spyOn(typedDelegate, "generate");
  const metrics = new InMemoryMetricsRecorder();
  const model = new MeteredReaderSummaryModelAdapter(delegate, metrics);
  const budget = { remainingTokens: 120000, remainingCostUsd: 10 };
  const result = await generateReaderSummaryWithDailyEditor({ model, input, budget,
    policy: { preferredProvider: "openai-responses", maxInputTokens: 100000,
      maxOutputTokens: 16000, maxEstimatedCostUsd: 5 } });
  expect(calls).toBe(2);
  expect(result.editor?.plan).toEqual(plan);
  expect(generate.mock.calls[0]?.[2]).toEqual({
    remainingTokens: budget.remainingTokens - result.editor!.usage.inputTokens - result.editor!.usage.outputTokens,
    remainingCostUsd: budget.remainingCostUsd - result.editor!.usage.estimatedCostUsd,
  });
  expect(result.attempt.dailyGenerationReceipt?.evidence).toHaveLength(30);
  expect(metrics.counters("summary_model_requests_total").filter(metric =>
    metric.labels.status === "succeeded")).toHaveLength(2);
});
