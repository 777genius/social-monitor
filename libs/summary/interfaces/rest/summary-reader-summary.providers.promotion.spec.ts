import type { FactoryProvider } from "@nestjs/common";
import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import { METRICS_RECORDER } from "@social-monitor/platform-metrics/nest/metrics-runtime.module";

import { ReaderSummaryPromotionMetricsRecorder } from "../../adapters/metrics/reader-summary-promotion-metrics.recorder";
import { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import type { ReaderSummaryPromotionControl } from "../../features/execute-reader-summary-job/reader-summary-promotion-control";
import { summaryReaderSummaryProviders } from "./summary-reader-summary.providers";

const executeReaderSummaryProvider = (): FactoryProvider => {
  const provider = summaryReaderSummaryProviders.find(
    (candidate): candidate is FactoryProvider =>
      "provide" in candidate &&
      candidate.provide === ExecuteReaderSummaryJobUseCase,
  );
  if (provider === undefined) {
    throw new Error("ExecuteReaderSummaryJobUseCase provider missing");
  }
  return provider;
};

describe("summaryReaderSummaryProviders promotion metrics wiring", () => {
  it("injects production metrics into reader summary promotion control", () => {
    const provider = executeReaderSummaryProvider();
    expect(provider.inject).toContain(METRICS_RECORDER);

    const metricsCalls: unknown[] = [];
    const metrics = {
      incrementCounter(value: unknown) {
        metricsCalls.push(value);
      },
    } as MetricsRecorderPort;

    const useCase = provider.useFactory!(
      {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, metrics,
    ) as ExecuteReaderSummaryJobUseCase;
    const promotionControl = (
      useCase as unknown as { promotionControl: ReaderSummaryPromotionControl }
    ).promotionControl;

    expect(promotionControl.metrics).toBeInstanceOf(
      ReaderSummaryPromotionMetricsRecorder,
    );

    promotionControl.metrics.record({
      candidateCount: 1,
      topCount: 1,
      additionalCount: 0,
      admittedEvidenceCount: 1,
      omittedEvidenceCount: 0,
      lifecycle: "delivered",
    });

    expect(metricsCalls).toContainEqual(expect.objectContaining({
      name: "reader_summary_promotion_evaluations_total",
      labels: expect.objectContaining({ lifecycle: "delivered" }),
    }));
  });
});
