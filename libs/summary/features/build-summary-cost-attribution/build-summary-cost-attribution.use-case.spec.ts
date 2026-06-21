import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { defaultSummaryGenerationPolicy } from '../../domain';
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
import type { SummaryEvalFixture } from '../evaluate-summary-quality/evaluate-summary-quality.command';
import type { EvaluateSummaryQualityResult } from '../evaluate-summary-quality/evaluate-summary-quality.result';
import { BuildSummaryCostAttributionUseCase } from './build-summary-cost-attribution.use-case';

const policy: SummaryModelPolicy = {
  preferredProvider: 'cost-fake',
  maxInputTokens: 12_000,
  maxOutputTokens: 1_500,
  maxEstimatedCostUsd: 0.5,
};

const budget: SummaryModelBudget = {
  remainingTokens: 20_000,
  remainingCostUsd: 1,
};

const route: SummaryModelRoute = {
  provider: 'cost-fake',
  model: 'cost-fake-v1',
  promptVersion: 'summary.prompt.cost-test.v1',
  schemaVersion: 'summary.artifact.v1',
};

const fixture: SummaryEvalFixture = {
  fixtureId: 'cost-fixture-1',
  datasetVersion: 'summary.eval.cost-test.v1',
  group: 'cost_regression',
  input: {
    tenantId: tenantId('tenant-cost-1'),
    workspaceId: workspaceId('workspace-cost-1'),
    topicId: 'topic-cost-1',
    requestedAt: new Date('2026-06-06T00:00:00.000Z'),
    policy: defaultSummaryGenerationPolicy(),
    evidence: {
      sourceWindow: {
        windowId: 'window-cost-1',
        startedAt: new Date('2026-06-06T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:01:00.000Z'),
        selectedFeedItemIds: ['feed-cost-1'],
      },
      items: [
        {
          feedItemId: 'feed-cost-1',
          sourceItemId: 'source-cost-1',
          sourceBindingId: 'binding-cost-1',
          providerKey: 'github',
          title: 'Cost attribution fixture',
          bodyPreview: 'Summary model usage should be attributed to every release fixture.',
          observedAt: new Date('2026-06-06T00:00:10.000Z'),
        },
      ],
    },
  },
  expectation: {
    expectedNoSignal: false,
    requiredQualityFlags: [],
    forbiddenOutputFragments: [],
    maxEstimatedCostUsd: 0.5,
  },
};

const evalResult: EvaluateSummaryQualityResult = {
  datasetVersions: ['summary.eval.cost-test.v1'],
  blockingPassed: true,
  fixtureResults: [
    {
      fixtureId: 'cost-fixture-1',
      datasetVersion: 'summary.eval.cost-test.v1',
      blockingPassed: true,
      failures: [],
      metrics: {
        inputTokens: 11,
        outputTokens: 22,
        estimatedCostUsd: 0.012345,
        keyPointCount: 1,
        citationCount: 1,
      },
    },
  ],
};

class CostAttributionModel implements SummaryModelPort {
  route(input: SummaryModelInput, modelPolicy: SummaryModelPolicy, modelBudget: SummaryModelBudget): SummaryModelRoute {
    void input;
    void modelPolicy;
    void modelBudget;

    return route;
  }

  estimate(input: SummaryModelInput, selectedRoute: SummaryModelRoute): SummaryModelEstimate {
    void input;
    void selectedRoute;

    return {
      inputTokens: 11,
      outputTokens: 22,
      estimatedCostUsd: 0.012345,
    };
  }

  async summarize(input: SummaryModelInput, selectedRoute: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
    void input;
    void selectedRoute;

    throw new Error('Cost attribution spec does not call summarize');
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
    void attempt;

    return { ok: true };
  }

  classifyError(error: unknown): SummaryModelFailure {
    return {
      kind: 'unknown',
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

describe('BuildSummaryCostAttributionUseCase', () => {
  it('attributes eval summary cost to tenant, workspace, topic and model dimensions', async () => {
    const result = new BuildSummaryCostAttributionUseCase(new CostAttributionModel()).execute({
      reportId: 'summary-cost-attribution-test',
      generatedBy: 'unit-test',
      fixtures: [fixture],
      evalResult,
      policy,
      budget,
    });

    expect(result.blockingPassed).toBe(true);
    expect(result.report.violations).toEqual([]);
    expect(result.report.totals).toMatchObject({
      fixtureCount: 1,
      attributedFixtureCount: 1,
      inputTokens: 11,
      outputTokens: 22,
      estimatedCostUsd: 0.012345,
      estimatedCostMicroUsd: 12_345,
    });
    expect(result.report.rows[0]).toMatchObject({
      fixtureId: 'cost-fixture-1',
      tenantId: 'tenant-cost-1',
      workspaceId: 'workspace-cost-1',
      topicId: 'topic-cost-1',
      sourceWindowId: 'window-cost-1',
      provider: 'cost-fake',
      model: 'cost-fake-v1',
    });
    expect(result.report.aggregates.byProviderModel[0]).toMatchObject({
      provider: 'cost-fake',
      model: 'cost-fake-v1',
      fixtureCount: 1,
    });
  });

  it('blocks when eval metrics drift from model preflight cost estimates', async () => {
    const firstFixtureResult = evalResult.fixtureResults[0];

    if (firstFixtureResult === undefined) {
      throw new Error('Expected fixture result');
    }

    const result = new BuildSummaryCostAttributionUseCase(new CostAttributionModel()).execute({
      reportId: 'summary-cost-attribution-test',
      generatedBy: 'unit-test',
      fixtures: [fixture],
      evalResult: {
        ...evalResult,
        fixtureResults: [
          {
            ...firstFixtureResult,
            metrics: {
              ...firstFixtureResult.metrics,
              inputTokens: 12,
            },
          },
        ],
      },
      policy,
      budget,
    });

    expect(result.blockingPassed).toBe(false);
    expect(result.report.violations).toContain(
      'cost-fixture-1: eval metrics do not match model preflight estimate',
    );
  });
});
