import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";

import type {
  ReaderSummaryPromotionAggregateMetrics,
  ReaderSummaryPromotionMetrics,
} from "../../features/execute-reader-summary-job/reader-summary-promotion-control";

export class ReaderSummaryPromotionMetricsRecorder implements
ReaderSummaryPromotionMetrics {
  constructor(private readonly metrics: MetricsRecorderPort) {}

  record(value: ReaderSummaryPromotionAggregateMetrics): void {
    const labels = {
      policy_version: "v1",
      disabled: value.disabled,
      lifecycle: value.lifecycle,
    };
    this.metrics.incrementCounter({
      name: "reader_summary_promotion_evaluations_total",
      labels,
    });
    for (const [outcome, count] of Object.entries({
      candidates: value.candidateCount,
      top: value.topCount,
      additional: value.additionalCount,
      admitted_evidence: value.admittedEvidenceCount,
      omitted_evidence: value.omittedEvidenceCount,
    })) {
      this.metrics.incrementCounter({
        name: "reader_summary_promotion_outcomes_total",
        value: count,
        labels: { ...labels, outcome },
      });
    }
  }
}
