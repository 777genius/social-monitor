import type {
  MetricLabels,
  MetricsRecorderPort,
} from "@social-monitor/platform-metrics";

import type {
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

  async generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    this.recordRequest(route, "started");

    try {
      const attempt = await this.delegate.generate(input, route);
      const usage = attempt.draft.usage;

      this.recordRequest(route, "succeeded");
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
      this.metrics.incrementCounter({
        name: "summary_model_estimated_cost_usd",
        value: usage.estimatedCostUsd,
        labels: {
          job_type: "reader_summary",
          model: route.model,
          provider: route.provider,
        },
      });

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
