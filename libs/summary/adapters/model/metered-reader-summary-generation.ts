import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelBudget,
  ReaderSummaryModelInput,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
} from "../../ports";
import { meterReaderSummaryAttempt } from "./reader-summary-metered-attempt";

/** Owns generation telemetry; an untrusted failed generation cannot charge usage. */
export const meterReaderSummaryGeneration = (params: {
  readonly delegate: ReaderSummaryModelPort;
  readonly metrics: MetricsRecorderPort;
  readonly input: ReaderSummaryModelInput;
  readonly route: ReaderSummaryModelRoute;
  readonly budget?: ReaderSummaryModelBudget;
}): Promise<ProviderReaderSummaryAttempt> => {
  const { delegate, metrics, input, route, budget } = params;
  return meterReaderSummaryAttempt({
    metrics,
    route,
    execute: () => delegate.generate(input, route, budget),
    usageOnSuccess: (attempt) => attempt.draft.usage,
    classifyFailure: (error) => delegate.classifyError(error).kind,
  });
};
