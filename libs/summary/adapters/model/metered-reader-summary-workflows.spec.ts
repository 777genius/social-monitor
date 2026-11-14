import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import type {
  ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelInput,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
} from "../../ports";
import { MeteredReaderSummaryModelAdapter } from "./metered-reader-summary-model.adapter";

const route = { model: "model-fixture", provider: "codex" } as ReaderSummaryModelRoute;
const input = {} as ReaderSummaryModelInput;

it("rejects an absent daily planner before starting a metered attempt", async () => {
  const metrics = new InMemoryMetricsRecorder();
  const delegate = { planDaily: undefined } as unknown as ReaderSummaryModelPort;
  const model = new MeteredReaderSummaryModelAdapter(delegate, metrics);
  await expect(model.planDaily(input, route)).rejects.toThrow(
    "Daily editorial planning adapter is unavailable",
  );
  expect(metrics.counters("summary_model_requests_total")).toHaveLength(0);
  expect(metrics.counters("summary_model_tokens_total")).toHaveLength(0);
});

it("preserves the delegate receiver and reports daily usage only after success", async () => {
  const metrics = new InMemoryMetricsRecorder();
  const usage = { inputTokens: 8, outputTokens: 4, estimatedCostUsd: 0.3 };
  const outcome = { usage } as ReaderSummaryDailyEditorialAttempt;
  const delegate = {
    planDaily(this: ReaderSummaryModelPort) {
      expect(this).toBe(delegate);
      return Promise.resolve(outcome);
    },
    classifyError: jest.fn(),
  } as unknown as ReaderSummaryModelPort;
  const model = new MeteredReaderSummaryModelAdapter(delegate, metrics);
  await expect(model.planDaily(input, route)).resolves.toBe(outcome);
  expect(metrics.counters("summary_model_requests_total").map((entry) => entry.labels.status))
    .toEqual(["started", "succeeded"]);
  expect(metrics.counterValue("summary_model_tokens_total", {
    job_type: "reader_summary", model: route.model, provider: route.provider, token_type: "input",
  })).toBe(8);
  expect(metrics.counterValue("summary_model_estimated_cost_usd", {
    job_type: "reader_summary", model: route.model, provider: route.provider,
  })).toBeCloseTo(0.3);
});

it("preserves an identical rejected generation without charging an untrusted result", async () => {
  const metrics = new InMemoryMetricsRecorder();
  const failure = Object.freeze(new Error("Provider unavailable"));
  const classify = jest.fn(() => ({
    kind: "provider_unavailable" as const, retryable: true, message: failure.message,
  }));
  const generate = jest.fn(async () => { throw failure; });
  const delegate = { generate, classifyError: classify } as unknown as ReaderSummaryModelPort;
  const model = new MeteredReaderSummaryModelAdapter(delegate, metrics);
  await expect(model.generate(input, route)).rejects.toBe(failure);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(classify).toHaveBeenCalledWith(failure);
  expect(metrics.counters("summary_model_requests_total").map((entry) => entry.labels.status))
    .toEqual(["started", "failed"]);
  expect(metrics.counters("summary_model_requests_total")[1]?.labels.failure_kind)
    .toBe("provider_unavailable");
  expect(metrics.counters("summary_model_tokens_total")).toHaveLength(0);
  expect(metrics.counters("summary_model_estimated_cost_usd")).toHaveLength(0);
});
