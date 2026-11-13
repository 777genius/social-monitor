import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';

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
import { meterSummaryModelAttempt } from './summary-model-metered-attempt';

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
    return meterSummaryModelAttempt({
      metrics: this.metrics,
      route,
      execute: () => this.delegate.summarize(input, route),
      classifyFailure: (error) => this.delegate.classifyError(error).kind,
    });
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(error: unknown): SummaryModelFailure {
    return this.delegate.classifyError(error);
  }
}
