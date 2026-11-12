import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import type { ReaderSummaryModelRoute } from "../../ports";
import { attachFailedDailyEditorUsage, readFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { meterReaderSummaryAttempt } from "./reader-summary-metered-attempt";
import { recordReaderSummaryModelRequest, recordReaderSummaryModelUsage } from "./reader-summary-model-metrics";

const route = { model: "synthetic-model", provider: "codex" } as ReaderSummaryModelRoute;
const usage = { inputTokens: 7, outputTokens: 5, estimatedCostUsd: 0.2 };

it("keeps the success status, usage and original result", async () => {
  const metrics = new InMemoryMetricsRecorder();
  const result = { usage };
  await expect(meterReaderSummaryAttempt({
    metrics, route, execute: async () => result,
    recordSuccess: (attempt) => {
      recordReaderSummaryModelRequest(metrics, route, "succeeded");
      recordReaderSummaryModelUsage(metrics, route, attempt.usage);
    },
    classifyFailure: () => "unused",
  })).resolves.toBe(result);
  expect(metrics.counters("summary_model_requests_total").map((entry) => entry.labels.status))
    .toEqual(["started", "succeeded"]);
  expect(metrics.counterValue("summary_model_tokens_total", {
    job_type: "reader_summary", model: route.model, provider: route.provider, token_type: "input",
  })).toBe(7);
  expect(metrics.counterValue("summary_model_estimated_cost_usd", {
    job_type: "reader_summary", model: route.model, provider: route.provider,
  })).toBeCloseTo(0.2);
});

it("records spent daily-editor usage and rethrows the identical frozen failure", async () => {
  const metrics = new InMemoryMetricsRecorder();
  const error = Object.freeze(new Error("rejected daily plan"));
  attachFailedDailyEditorUsage(error, usage);
  const recordSuccess = jest.fn();
  const classifyFailure = jest.fn(() => "invalid_schema");
  await expect(meterReaderSummaryAttempt({
    metrics, route, execute: async () => { throw error; },
    recordSuccess, classifyFailure, failedUsage: readFailedDailyEditorUsage,
  })).rejects.toBe(error);
  expect(recordSuccess).not.toHaveBeenCalled();
  expect(classifyFailure).toHaveBeenCalledWith(error);
  expect(metrics.counters("summary_model_requests_total").map((entry) => entry.labels.status))
    .toEqual(["started", "failed"]);
  expect(metrics.counters("summary_model_requests_total")[1]?.labels.failure_kind).toBe("invalid_schema");
  expect(metrics.counterValue("summary_model_tokens_total", {
    job_type: "reader_summary", model: route.model, provider: route.provider, token_type: "output",
  })).toBe(5);
});

it("never infers token cost from an unattested generation failure", async () => {
  const metrics = new InMemoryMetricsRecorder();
  const error = new Error("provider timeout");
  await expect(meterReaderSummaryAttempt({
    metrics, route, execute: async () => { throw error; },
    recordSuccess: () => { throw new Error("must not record success"); },
    classifyFailure: () => "provider_unavailable",
  })).rejects.toBe(error);
  expect(metrics.counters("summary_model_tokens_total")).toHaveLength(0);
  expect(metrics.counters("summary_model_estimated_cost_usd")).toHaveLength(0);
  expect(metrics.counters("summary_model_requests_total").map((entry) => entry.labels.status))
    .toEqual(["started", "failed"]);
});
