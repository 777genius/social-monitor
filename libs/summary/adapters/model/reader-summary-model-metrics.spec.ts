import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import type { ReaderSummaryModelRoute } from "../../ports";
import {
  recordReaderSummaryModelRequest,
  recordReaderSummaryModelUsage,
} from "./reader-summary-model-metrics";

const route: ReaderSummaryModelRoute = {
  provider: "agent-runtime",
  model: "synthetic-test-model",
  promptVersion: "synthetic-test-prompt",
  schemaVersion: "reader_summary.artifact.v1",
};

describe("reader summary model telemetry policy", () => {
  it("does not invent token counts when either usage token count is unavailable", () => {
    const metrics = new InMemoryMetricsRecorder();

    recordReaderSummaryModelUsage(metrics, route, {
      inputTokens: null,
      outputTokens: 8,
      estimatedCostUsd: 0.02,
    });

    expect(metrics.counters("summary_model_tokens_total")).toEqual([]);
    expect(metrics.counterValue("summary_model_estimated_cost_usd", {
      job_type: "reader_summary",
      model: route.model,
      provider: route.provider,
    })).toBeCloseTo(0.02);
  });

  it("keeps both token types and reader job labels for completed usage", () => {
    const metrics = new InMemoryMetricsRecorder();
    recordReaderSummaryModelUsage(metrics, route, {
      inputTokens: 13,
      outputTokens: 5,
      estimatedCostUsd: 0.01,
    });

    expect(metrics.counterValue("summary_model_tokens_total", {
      job_type: "reader_summary",
      model: route.model,
      provider: route.provider,
      token_type: "input",
    })).toBe(13);
    expect(metrics.counterValue("summary_model_tokens_total", {
      job_type: "reader_summary",
      model: route.model,
      provider: route.provider,
      token_type: "output",
    })).toBe(5);
  });

  it("records failure kinds only on failed requests", () => {
    const metrics = new InMemoryMetricsRecorder();
    recordReaderSummaryModelRequest(metrics, route, "started");
    recordReaderSummaryModelRequest(metrics, route, "failed", "invalid_schema");

    const records = metrics.counters("summary_model_requests_total");
    expect(records).toHaveLength(2);
    expect(records[0]?.labels).toEqual({
      job_type: "reader_summary", model: route.model,
      provider: route.provider, status: "started",
    });
    expect(records[1]?.labels).toEqual({
      failure_kind: "invalid_schema", job_type: "reader_summary",
      model: route.model, provider: route.provider, status: "failed",
    });
  });
});
