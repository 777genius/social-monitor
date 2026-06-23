import type { MetricLabels, MetricsRecorderPort } from '@social-monitor/platform-metrics';

import type {
  BriefingModelBudget,
  BriefingModelEstimate,
  BriefingModelFailure,
  BriefingModelInput,
  BriefingModelPolicy,
  BriefingModelPort,
  BriefingModelRoute,
  BriefingModelValidationResult,
  ProviderBriefingAttempt,
} from '../../ports';

export class MeteredBriefingModelAdapter implements BriefingModelPort {
  constructor(
    private readonly delegate: BriefingModelPort,
    private readonly metrics: MetricsRecorderPort,
  ) {}

  route(input: BriefingModelInput, policy: BriefingModelPolicy, budget: BriefingModelBudget): BriefingModelRoute {
    return this.delegate.route(input, policy, budget);
  }

  estimate(input: BriefingModelInput, route: BriefingModelRoute): BriefingModelEstimate {
    return this.delegate.estimate(input, route);
  }

  async generate(input: BriefingModelInput, route: BriefingModelRoute): Promise<ProviderBriefingAttempt> {
    this.recordRequest(route, 'started');

    try {
      const attempt = await this.delegate.generate(input, route);
      const usage = attempt.draft.usage;

      this.recordRequest(route, 'succeeded');
      this.metrics.incrementCounter({
        name: 'summary_model_tokens_total',
        value: usage.inputTokens,
        labels: {
          job_type: 'briefing',
          model: route.model,
          provider: route.provider,
          token_type: 'input',
        },
      });
      this.metrics.incrementCounter({
        name: 'summary_model_tokens_total',
        value: usage.outputTokens,
        labels: {
          job_type: 'briefing',
          model: route.model,
          provider: route.provider,
          token_type: 'output',
        },
      });
      this.metrics.incrementCounter({
        name: 'summary_model_estimated_cost_usd',
        value: usage.estimatedCostUsd,
        labels: {
          job_type: 'briefing',
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

  validateRawProviderResponse(attempt: ProviderBriefingAttempt): BriefingModelValidationResult {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(error: unknown): BriefingModelFailure {
    return this.delegate.classifyError(error);
  }

  private recordRequest(route: BriefingModelRoute, status: 'started' | 'succeeded' | 'failed', failureKind?: string): void {
    const labels: MetricLabels = {
      ...(failureKind === undefined ? {} : { failure_kind: failureKind }),
      job_type: 'briefing',
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
