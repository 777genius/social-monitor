import type { MetricLabels, MetricsRecorderPort } from "@social-monitor/platform-metrics";
import type { ReaderSummaryModelRoute } from "../../ports";

// Owns the provider-neutral telemetry taxonomy for the reader model
// boundary. Callers retain ownership of lifecycle, retries and failures.
export const recordReaderSummaryModelUsage = (
  metrics: MetricsRecorderPort,
  route: ReaderSummaryModelRoute,
  usage: { readonly inputTokens: number | null; readonly outputTokens: number | null;
    readonly estimatedCostUsd: number },
): void => {
  if (usage.inputTokens !== null && usage.outputTokens !== null) {
    metrics.incrementCounter({
      name: "summary_model_tokens_total",
      value: usage.inputTokens,
      labels: {
        job_type: "reader_summary",
        model: route.model,
        provider: route.provider,
        token_type: "input",
      },
    });
    metrics.incrementCounter({
      name: "summary_model_tokens_total",
      value: usage.outputTokens,
      labels: {
        job_type: "reader_summary",
        model: route.model,
        provider: route.provider,
        token_type: "output",
      },
    });
  }
  metrics.incrementCounter({
    name: "summary_model_estimated_cost_usd",
    value: usage.estimatedCostUsd,
    labels: {
      job_type: "reader_summary",
      model: route.model,
      provider: route.provider,
    },
  });
};

export const recordReaderSummaryModelRequest = (
  metrics: MetricsRecorderPort,
  route: ReaderSummaryModelRoute,
  status: "started" | "succeeded" | "failed",
  failureKind?: string,
): void => {
  const labels: MetricLabels = {
    ...(failureKind === undefined ? {} : { failure_kind: failureKind }),
    job_type: "reader_summary",
    model: route.model,
    provider: route.provider,
    status,
  };

  metrics.incrementCounter({
    name: "summary_model_requests_total",
    labels,
  });
};
