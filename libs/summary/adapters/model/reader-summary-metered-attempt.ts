import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import type { ReaderSummaryModelEstimate, ReaderSummaryModelRoute } from "../../ports";
import {
  recordReaderSummaryModelRequest,
  recordReaderSummaryModelUsage,
} from "./reader-summary-model-metrics";

type MeteredReaderSummaryAttempt<T> = {
  readonly metrics: MetricsRecorderPort;
  readonly route: ReaderSummaryModelRoute;
  readonly execute: () => Promise<T>;
  // Callers preserve their operation-specific success status/usage read order.
  readonly recordSuccess: (attempt: T) => void;
  readonly classifyFailure: (error: unknown) => string;
  readonly failedUsage?: (error: unknown) => ReaderSummaryModelEstimate | undefined;
};

/** Measure an attempt without changing the provider error, retries or paid usage. */
export const meterReaderSummaryAttempt = async <T>(
  params: MeteredReaderSummaryAttempt<T>,
): Promise<T> => {
  recordReaderSummaryModelRequest(params.metrics, params.route, "started");
  try {
    const attempt = await params.execute();
    params.recordSuccess(attempt);
    return attempt;
  } catch (error) {
    const failedUsage = params.failedUsage?.(error);
    if (failedUsage !== undefined) {
      recordReaderSummaryModelUsage(params.metrics, params.route, failedUsage);
    }
    recordReaderSummaryModelRequest(
      params.metrics, params.route, "failed", params.classifyFailure(error),
    );
    throw error;
  }
};
