import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import type {
  ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelInput,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
} from "../../ports";
import { readFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { meterReaderSummaryAttempt } from "./reader-summary-metered-attempt";
import {
  recordReaderSummaryModelRequest,
  recordReaderSummaryModelUsage,
} from "./reader-summary-model-metrics";

/** Owns daily planning admission and the paid usage attached to rejected plans. */
export const meterReaderSummaryDailyPlanning = async (params: {
  readonly delegate: ReaderSummaryModelPort;
  readonly metrics: MetricsRecorderPort;
  readonly input: ReaderSummaryModelInput;
  readonly route: ReaderSummaryModelRoute;
}): Promise<ReaderSummaryDailyEditorialAttempt> => {
  const { delegate, metrics, input, route } = params;
  // Preserve the original capability rejection before any attempt is metered.
  if (delegate.planDaily === undefined) {
    throw new Error("Daily editorial planning adapter is unavailable");
  }
  const planDaily = delegate.planDaily.bind(delegate);
  return meterReaderSummaryAttempt({
    metrics,
    route,
    execute: () => planDaily(input, route),
    recordSuccess: (attempt) => {
      recordReaderSummaryModelRequest(metrics, route, "succeeded");
      recordReaderSummaryModelUsage(metrics, route, attempt.usage);
    },
    classifyFailure: (error) => delegate.classifyError(error).kind,
    failedUsage: readFailedDailyEditorUsage,
  });
};
