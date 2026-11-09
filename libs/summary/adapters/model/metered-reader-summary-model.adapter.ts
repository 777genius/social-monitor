import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";
import {
  recordReaderSummaryModelRequest,
  recordReaderSummaryModelUsage,
} from "./reader-summary-model-metrics";
import { readFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";

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
    recordReaderSummaryModelRequest(this.metrics,route, "started");
    try {
      const attempt = await this.delegate.planDaily(input, route);
      recordReaderSummaryModelRequest(this.metrics,route, "succeeded");
      recordReaderSummaryModelUsage(this.metrics,route, attempt.usage);
      return attempt;
    } catch (error) {
      const failedUsage = readFailedDailyEditorUsage(error);
      if (failedUsage !== undefined) recordReaderSummaryModelUsage(this.metrics,route, failedUsage);
      recordReaderSummaryModelRequest(this.metrics,route, "failed", this.delegate.classifyError(error).kind);
      throw error;
    }
  }

  async generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
    budget?: ReaderSummaryModelBudget,
  ): Promise<ProviderReaderSummaryAttempt> {
    recordReaderSummaryModelRequest(this.metrics,route, "started");

    try {
      const attempt = await this.delegate.generate(input, route, budget);
      const usage = attempt.draft.usage;

      recordReaderSummaryModelRequest(this.metrics,route, "succeeded");
      recordReaderSummaryModelUsage(this.metrics,route, usage);

      return attempt;
    } catch (error) {
      const failure = this.delegate.classifyError(error);
      recordReaderSummaryModelRequest(this.metrics,route, "failed", failure.kind);
      throw error;
    }
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
