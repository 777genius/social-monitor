import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";

import { ReaderSummaryPromotionMetricsRecorder } from "./reader-summary-promotion-metrics.recorder";

describe("ReaderSummaryPromotionMetricsRecorder", () => {
  it("records aggregate outcomes without candidate identifiers", () => {
    const calls: unknown[] = [];
    const metrics = {
      incrementCounter(value: unknown) { calls.push(value); },
    } as MetricsRecorderPort;

    new ReaderSummaryPromotionMetricsRecorder(metrics).record({
      candidateCount: 5,
      topCount: 2,
      additionalCount: 1,
      admittedEvidenceCount: 3,
      omittedEvidenceCount: 2,
      disabled: false,
      lifecycle: "evaluated",
    });

    expect(calls).toHaveLength(6);
    expect(JSON.stringify(calls)).not.toMatch(/candidate-|feed-|source-/);
    expect(calls).toContainEqual(expect.objectContaining({
      name: "reader_summary_promotion_outcomes_total",
      value: 2,
      labels: expect.objectContaining({ outcome: "top" }),
    }));
  });
});
