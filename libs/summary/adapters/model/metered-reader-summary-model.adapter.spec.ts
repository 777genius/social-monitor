import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import type { ReaderSummaryModelPort } from "../../ports";
import { dailyEditorialCoveragePlan, validateDailyEditorialPlan } from "../../domain";
import { generateReaderSummaryWithDailyEditor } from "../../features/execute-reader-summary-job/reader-summary-daily-editorial-generation";
import { MeteredReaderSummaryModelAdapter } from "./metered-reader-summary-model.adapter";
import { attachFailedDailyEditorUsage, readFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { OpenAiResponsesReaderSummaryModelAdapter } from "./openai-responses-reader-summary-model.adapter";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import { CapturingAgentRuntimeClient } from "./agent-runtime-reader-summary-model.spec-support";
import { dailyDigestFixture, dailyProviderDraft } from "./reader-summary-daily-digest.fixture";
import { jsonResponse } from "./reader-summary-model-promotion.spec-support";

it("preserves editor capability and the residual writer budget through the runtime metrics decorator", async () => {
  const { input } = await dailyDigestFixture();
  const plan = validateDailyEditorialPlan({ version: "reader_summary.daily_editorial.v2",
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

it("records spent OpenAI editor tokens even when its JSON plan fails validation", async () => {
  const { input } = await dailyDigestFixture();
  const delegate = new OpenAiResponsesReaderSummaryModelAdapter({
    apiKey: "fixture-only-key",
    estimatedInputCostUsdPerMillionTokens: 2,
    estimatedOutputCostUsdPerMillionTokens: 8,
    fetchFn: async () => jsonResponse({ output_text: "{}",
      usage: { input_tokens: 120, output_tokens: 30 } }),
  });
  const metrics = new InMemoryMetricsRecorder();
  const model = new MeteredReaderSummaryModelAdapter(delegate, metrics);
  const route = model.route(input, {
    preferredProvider: "openai-responses", maxInputTokens: 100000,
    maxOutputTokens: 16000, maxEstimatedCostUsd: 5,
  }, { remainingTokens: 160000, remainingCostUsd: 10 });

  const originalPlanDaily = delegate.planDaily.bind(delegate);
  let delegateError: unknown;
  jest.spyOn(delegate, "planDaily").mockImplementation(async (value, selectedRoute) => {
    try { return await originalPlanDaily(value, selectedRoute); }
    catch (error) { delegateError = error; throw error; }
  });
  const caught = await model.planDaily(input, route).catch((error: unknown) => error);
  expect(delegateError).toBeInstanceOf(Error);
  expect(caught).toBe(delegateError);
  expect(metrics.counterValue("summary_model_tokens_total", {
    job_type: "reader_summary", model: route.model, provider: route.provider, token_type: "input",
  })).toBe(120);
  expect(metrics.counterValue("summary_model_tokens_total", {
    job_type: "reader_summary", model: route.model, provider: route.provider, token_type: "output",
  })).toBe(30);
  expect(metrics.counterValue("summary_model_estimated_cost_usd", {
    job_type: "reader_summary", model: route.model, provider: route.provider,
  })).toBeGreaterThan(0);
  expect(metrics.counters("summary_model_requests_total").filter(metric =>
    metric.labels.job_type === "reader_summary" &&
    metric.labels.model === route.model && metric.labels.provider === route.provider &&
    metric.labels.status === "failed")).toHaveLength(1);
});

it("records failed agent-runtime editor usage without changing its failure", async () => {
  const { input } = await dailyDigestFixture();
  const client = new CapturingAgentRuntimeClient({
    status: "completed", structuredOutput: {
      version: "reader_summary.daily_editorial.v2", topics: [],
    }, warnings: [],
    usage: { inputTokens: 240, outputTokens: 50, totalTokens: 290, estimatedCostUsd: 0.27 },
  });
  const delegate = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const metrics = new InMemoryMetricsRecorder();
  const model = new MeteredReaderSummaryModelAdapter(delegate, metrics);
  const route = model.route(input, {
    preferredProvider: "agent-runtime", maxInputTokens: 100000,
    maxOutputTokens: 16000, maxEstimatedCostUsd: 5,
  }, { remainingTokens: 160000, remainingCostUsd: 10 });

  const originalPlanDaily = delegate.planDaily.bind(delegate);
  let delegateError: unknown;
  jest.spyOn(delegate, "planDaily").mockImplementation(async (value, selectedRoute) => {
    try { return await originalPlanDaily(value, selectedRoute); }
    catch (error) { delegateError = error; throw error; }
  });
  const caught = await model.planDaily(input, route).catch((error: unknown) => error);
  expect(delegateError).toBeInstanceOf(Error);
  expect(caught).toBe(delegateError);
  expect(client.commands).toHaveLength(1);
  expect(metrics.counterValue("summary_model_tokens_total", {
    job_type: "reader_summary", model: route.model, provider: route.provider, token_type: "input",
  })).toBe(240);
  expect(metrics.counterValue("summary_model_tokens_total", {
    job_type: "reader_summary", model: route.model, provider: route.provider, token_type: "output",
  })).toBe(50);
  expect(metrics.counterValue("summary_model_estimated_cost_usd", {
    job_type: "reader_summary", model: route.model, provider: route.provider,
  })).toBeCloseTo(0.27);
  expect(metrics.counters("summary_model_requests_total").filter(metric =>
    metric.labels.job_type === "reader_summary" &&
    metric.labels.model === route.model && metric.labels.provider === route.provider &&
    metric.labels.status === "failed")).toHaveLength(1);
});

it("retains usage on a frozen provider error without mutating it", () => {
  const error = Object.freeze(new Error("Immutable provider failure"));
  const usage = { inputTokens: 7, outputTokens: 5, estimatedCostUsd: 0.2 };
  attachFailedDailyEditorUsage(error, usage);
  expect(readFailedDailyEditorUsage(error)).toEqual(usage);
  expect(Object.isExtensible(error)).toBe(false);
});

it("does not charge a gateway editor request rejected before dispatch", async () => {
  const { input } = await dailyDigestFixture();
  const client = new CapturingAgentRuntimeClient({
    status: "failed", warnings: [],
    failure: { code: "invalid_request", safeMessage: "Request was not dispatched",
      retryable: false, reconnectRequired: false, causeCategory: "invalid_request",
      details: { gatewayEffect: "not_dispatched" } },
  });
  const delegate = new AgentRuntimeReaderSummaryModelAdapter({ client, agentProvider: "codex" });
  const metrics = new InMemoryMetricsRecorder();
  const model = new MeteredReaderSummaryModelAdapter(delegate, metrics);
  const route = model.route(input, {
    preferredProvider: "agent-runtime", maxInputTokens: 100000,
    maxOutputTokens: 16000, maxEstimatedCostUsd: 5,
  }, { remainingTokens: 160000, remainingCostUsd: 10 });
  await expect(model.planDaily(input, route)).rejects.toThrow();
  expect(client.commands).toHaveLength(1);
  expect(metrics.counters("summary_model_tokens_total")).toHaveLength(0);
  expect(metrics.counters("summary_model_estimated_cost_usd")).toHaveLength(0);
  expect(metrics.counters("summary_model_requests_total").filter(metric =>
    metric.labels.status === "failed")).toHaveLength(1);
});
