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
  assertDeterministicSummaryBudget,
  estimateDeterministicSummaryTokens,
} from './deterministic-summary-budget-policy';
import { buildDeterministicSummaryAttempt } from './deterministic-summary-draft';

const route: SummaryModelRoute = {
  provider: 'deterministic-local',
  model: 'summary-fake-v1',
  promptVersion: 'summary.prompt.v1',
  schemaVersion: 'summary.artifact.v1',
};

export class DeterministicSummaryModelAdapter implements SummaryModelPort {
  route(
    input: SummaryModelInput,
    policy: SummaryModelPolicy,
    budget: SummaryModelBudget,
  ): SummaryModelRoute {
    const estimate = this.estimate(input, route);
    assertDeterministicSummaryBudget(estimate, policy, budget);
    return route;
  }

  estimate(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): SummaryModelEstimate {
    void selectedRoute;
    return estimateDeterministicSummaryTokens(input);
  }

  async summarize(
    input: SummaryModelInput,
    selectedRoute: SummaryModelRoute,
  ): Promise<ProviderSummaryAttempt> {
    const usage = this.estimate(input, selectedRoute);
    return buildDeterministicSummaryAttempt(input, selectedRoute, usage);
  }

  validateRawProviderResponse(
    attempt: ProviderSummaryAttempt,
  ): SummaryModelValidationResult {
    if (attempt.route.schemaVersion !== 'summary.artifact.v1') {
      return {
        ok: false,
        failure: {
          kind: 'invalid_schema',
          retryable: false,
          message: 'Unsupported summary schema version',
        },
      };
    }

    return { ok: true };
  }

  classifyError(error: unknown): SummaryModelFailure {
    const message =
      error instanceof Error ? error.message : 'Unknown summary model error';

    if (message.toLowerCase().includes('budget')) {
      return {
        kind: 'budget_exceeded',
        retryable: false,
        message,
      };
    }

    if (message.toLowerCase().includes('citation')) {
      return {
        kind: 'citation_validation_failed',
        retryable: false,
        message,
      };
    }

    return {
      kind: 'unknown',
      retryable: false,
      message,
    };
  }
}

