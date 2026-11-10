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
import {
  recordSummaryModelRequest,
  recordSummaryModelUsage,
} from './summary-model-metrics';

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
    recordSummaryModelRequest(this.metrics, route, 'started');

    try {
      const attempt = await this.delegate.summarize(input, route);
      const usage = attempt.draft.usage;

      recordSummaryModelRequest(this.metrics, route, 'succeeded');
      recordSummaryModelUsage(this.metrics, route, usage);

      return attempt;
    } catch (error) {
      const failure = this.delegate.classifyError(error);
      recordSummaryModelRequest(this.metrics, route, 'failed', failure.kind);
      throw error;
    }
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
    return this.delegate.validateRawProviderResponse(attempt);
  }

  classifyError(error: unknown): SummaryModelFailure {
    return this.delegate.classifyError(error);
  }
}
