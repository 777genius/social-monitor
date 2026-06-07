import type { MetricLabels, MetricsRecorderPort } from '@social-monitor/platform-metrics';

import type {
  ProviderSummaryAttempt,
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelFailure,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelPort,
  SummaryModelRoute,
  SummaryModelValidationResult,
} from '../../ports';

export class MeteredSummaryModelAdapter implements SummaryModelPort {
  constructor(
    private readonly delegate: SummaryModelPort,
    private readonly metrics: MetricsRecorderPort,
  ) {}

  route(input: SummaryModelInput, policy: SummaryModelPolicy, budget: SummaryModelBudget): SummaryModelRoute {
    return this.delegate.route(input, policy, budget);
  }

  estimate(input: SummaryModelInput, route: SummaryModelRoute): SummaryModelEstimate {
    return this.delegate.estimate(input, route);
  }

  async summarize(input: SummaryModelInput, route: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
    this.recordRequest(route, 'started');

    try {
      const attempt = await this.delegate.summarize(input, route);
      const usage = attempt.draft.usage;

      this.recordRequest(route, 'succeeded');
      this.metrics.incrementCounter({
        name: 'summary_model_tokens_total',
        value: usage.inputTokens,
        labels: {
          model: route.model,
          provider: route.provider,
          token_type: 'input',
        },
      });
      this.metrics.incrementCounter({
        name: 'summary_model_tokens_total',
        value: usage.outputTokens,
        labels: {
          model: route.model,
          provider: route.provider,
          token_type: 'output',
        },
      });
      this.metrics.incrementCounter({
        name: 'summary_model_estimated_cost_usd',
        value: usage.estimatedCostUsd,
        labels: {
          model: route.model,
          provider: route.provider,
        },
      });

      return attempt;
    } catch (error) {
      const failure = this.delegate.classifyError(error);
      this.recordRequest(route, 'failed', failure.kind);
      throw error;
    }
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(error: unknown): SummaryModelFailure {
    return this.delegate.classifyError(error);
  }

  private recordRequest(route: SummaryModelRoute, status: 'started' | 'succeeded' | 'failed', failureKind?: string): void {
    const labels: MetricLabels = {
      ...(failureKind === undefined ? {} : { failure_kind: failureKind }),
      model: route.model,
      provider: route.provider,
      status,
    };

    this.metrics.incrementCounter({
      name: 'summary_model_requests_total',
      labels,
    });
  }
}
