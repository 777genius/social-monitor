import type {
  MetricLabels,
  MetricsRecorderPort,
} from "@social-monitor/platform-metrics";
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
    this.recordRequest(route, "started");
    try {
      const attempt = await this.delegate.planDaily(input, route);
      this.recordRequest(route, "succeeded");
      this.recordUsage(route, attempt.usage);
      return attempt;
    } catch (error) {
      const failedUsage = readFailedDailyEditorUsage(error);
      if (failedUsage !== undefined) this.recordUsage(route, failedUsage);
      this.recordRequest(route, "failed", this.delegate.classifyError(error).kind);
      throw error;
    }
  }

  async generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
    budget?: ReaderSummaryModelBudget,
  ): Promise<ProviderReaderSummaryAttempt> {
    this.recordRequest(route, "started");

    try {
      const attempt = await this.delegate.generate(input, route, budget);
      const usage = attempt.draft.usage;

      this.recordRequest(route, "succeeded");
      this.recordUsage(route, usage);

      return attempt;
    } catch (error) {
      const failure = this.delegate.classifyError(error);
      this.recordRequest(route, "failed", failure.kind);
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

  private recordUsage(
    route: ReaderSummaryModelRoute,
    usage: { readonly inputTokens: number | null; readonly outputTokens: number | null;
      readonly estimatedCostUsd: number },
  ): void {
    if (usage.inputTokens !== null && usage.outputTokens !== null) {
      this.metrics.incrementCounter({
        name: "summary_model_tokens_total",
        value: usage.inputTokens,
        labels: {
          job_type: "reader_summary",
          model: route.model,
          provider: route.provider,
          token_type: "input",
        },
      });
      this.metrics.incrementCounter({
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
    this.metrics.incrementCounter({
      name: "summary_model_estimated_cost_usd",
      value: usage.estimatedCostUsd,
      labels: {
        job_type: "reader_summary",
        model: route.model,
        provider: route.provider,
      },
    });
  }

  private recordRequest(
    route: ReaderSummaryModelRoute,
    status: "started" | "succeeded" | "failed",
    failureKind?: string,
  ): void {
    const labels: MetricLabels = {
      ...(failureKind === undefined ? {} : { failure_kind: failureKind }),
      job_type: "reader_summary",
      model: route.model,
      provider: route.provider,
      status,
    };

    this.metrics.incrementCounter({
      name: "summary_model_requests_total",
      labels,
    });
  }
}
