import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import { meterReaderSummaryDailyPlanning } from "./metered-reader-summary-daily-planning";
import { meterReaderSummaryGeneration } from "./metered-reader-summary-generation";

import type {
  ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
  ProviderReaderSummaryAttempt,
} from "../../ports";

export class MeteredReaderSummaryModelAdapter implements ReaderSummaryModelPort {
  constructor(
    private readonly delegate: ReaderSummaryModelPort,
    private readonly metrics: MetricsRecorderPort,
  ) {}

  route(
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute {
    return this.delegate.route(input, policy, budget);
  }

  estimate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
  ): ReaderSummaryModelEstimate {
    return this.delegate.estimate(input, route);
  }

  async planDaily(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
  ): Promise<ReaderSummaryDailyEditorialAttempt> {
    return meterReaderSummaryDailyPlanning({
      delegate: this.delegate,
      metrics: this.metrics,
      input,
      route,
    });
  }

  async generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
    budget?: ReaderSummaryModelBudget,
  ): Promise<ProviderReaderSummaryAttempt> {
    return meterReaderSummaryGeneration({
      delegate: this.delegate,
      metrics: this.metrics,
      input,
      route,
      budget,
    });
  }

  validateRawProviderResponse(
    attempt: ProviderReaderSummaryAttempt,
  ): ReaderSummaryModelValidationResult {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return this.delegate.classifyError(error);
  }

}
