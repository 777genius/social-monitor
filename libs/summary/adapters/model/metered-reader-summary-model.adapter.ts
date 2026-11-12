import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import {
  recordReaderSummaryModelRequest,
  recordReaderSummaryModelUsage,
} from "./reader-summary-model-metrics";
import { readFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { meterReaderSummaryAttempt } from "./reader-summary-metered-attempt";

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
    if (this.delegate.planDaily === undefined) {
      throw new Error("Daily editorial planning adapter is unavailable");
    }
    const planDaily = this.delegate.planDaily.bind(this.delegate);
    return meterReaderSummaryAttempt({
      metrics: this.metrics,
      route,
      execute: () => planDaily(input, route),
      recordSuccess: (attempt) => {
        recordReaderSummaryModelRequest(this.metrics, route, "succeeded");
        recordReaderSummaryModelUsage(this.metrics, route, attempt.usage);
      },
      classifyFailure: (error) => this.delegate.classifyError(error).kind,
      failedUsage: readFailedDailyEditorUsage,
    });
  }

  async generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
    budget?: ReaderSummaryModelBudget,
  ): Promise<ProviderReaderSummaryAttempt> {
    return meterReaderSummaryAttempt({
      metrics: this.metrics,
      route,
      execute: () => this.delegate.generate(input, route, budget),
      recordSuccess: (attempt) => {
        const usage = attempt.draft.usage;
        recordReaderSummaryModelRequest(this.metrics, route, "succeeded");
        recordReaderSummaryModelUsage(this.metrics, route, usage);
      },
      classifyFailure: (error) => this.delegate.classifyError(error).kind,
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
