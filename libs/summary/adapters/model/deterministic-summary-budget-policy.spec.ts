import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { defaultSummaryGenerationPolicy } from '../../domain';
import type { SummaryModelInput, SummaryModelPolicy, SummaryModelBudget } from '../../ports';
import {
  assertDeterministicSummaryBudget,
  estimateDeterministicSummaryTokens,
} from './deterministic-summary-budget-policy';
import { DeterministicSummaryModelAdapter } from './deterministic-summary-model.adapter';

const requestedAt = new Date('2026-06-06T00:00:00.000Z');

const makeInput = (withEvidence: boolean): SummaryModelInput => ({
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  interestId: 'interest-1',
  requestedAt,
  policy: defaultSummaryGenerationPolicy(),
  evidence: {
    sourceWindow: {
      windowId: 'window-1',
      startedAt: requestedAt,
      endedAt: requestedAt,
      selectedFeedItemIds: withEvidence ? ['feed-1'] : [],
    },
    items: withEvidence
      ? [{
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          sourceBindingId: 'binding-1',
          providerKey: 'github',
          title: 'A verified fixture',
          bodyPreview: 'With context',
          canonicalUrl: 'https://example.test/fixture',
          observedAt: requestedAt,
        }]
      : [],
  },
});

describe('Deterministic summary estimate and admission policy', () => {
  const adapter = new DeterministicSummaryModelAdapter();

  it('preserves empty-evidence 48-token reserve and zero estimated cost', () => {
    const input = makeInput(false);
    const estimate = estimateDeterministicSummaryTokens(input);
    expect(estimate).toEqual({
      inputTokens: Math.ceil(input.interestId.length / 4),
      outputTokens: 48,
      estimatedCostUsd: 0,
    });
    expect(adapter.estimate(input, {
      provider: 'different-route',
      model: 'ignored-by-local-estimator',
      promptVersion: 'test',
      schemaVersion: 'summary.artifact.v1',
    })).toEqual(estimate);
  });

  it('includes evidence title/body and rendered memory text without changing budget use', () => {
    const input = {
      ...makeInput(true),
      memoryContext: {
        status: 'available' as const,
        renderedText: 'memory fact',
        diagnostics: {},
        retrievedAt: requestedAt,
      },
    };
    const estimate = estimateDeterministicSummaryTokens(input);
    const evidence = input.evidence.items[0]!;
    expect(estimate).toEqual({
      inputTokens: Math.ceil(
        (input.interestId.length + evidence.title.length +
          (evidence.bodyPreview?.length ?? 0) + 'memory fact'.length) / 4,
      ),
      outputTokens: 160,
      estimatedCostUsd: 0,
    });
  });

  it('admits equality at all five budget limits', () => {
    const estimate = estimateDeterministicSummaryTokens(makeInput(true));
    const policy: SummaryModelPolicy = {
      preferredProvider: 'deterministic-local',
      maxInputTokens: estimate.inputTokens,
      maxOutputTokens: estimate.outputTokens,
      maxEstimatedCostUsd: estimate.estimatedCostUsd,
    };
    const budget: SummaryModelBudget = {
      remainingTokens: estimate.inputTokens + estimate.outputTokens,
      remainingCostUsd: estimate.estimatedCostUsd,
    };
    expect(() => assertDeterministicSummaryBudget(estimate, policy, budget)).not.toThrow();
    expect(adapter.route(makeInput(true), policy, budget)).toMatchObject({
      provider: 'deterministic-local',
      model: 'summary-fake-v1',
    });
  });

  it('rejects input, output, estimated cost and both remaining-budget overages', () => {
    const estimate = estimateDeterministicSummaryTokens(makeInput(true));
    const policy: SummaryModelPolicy = {
      preferredProvider: 'deterministic-local',
      maxInputTokens: estimate.inputTokens,
      maxOutputTokens: estimate.outputTokens,
      maxEstimatedCostUsd: estimate.estimatedCostUsd,
    };
    const budget: SummaryModelBudget = {
      remainingTokens: estimate.inputTokens + estimate.outputTokens,
      remainingCostUsd: estimate.estimatedCostUsd,
    };
    const violations: readonly [SummaryModelPolicy, SummaryModelBudget][] = [
      [{ ...policy, maxInputTokens: estimate.inputTokens - 1 }, budget],
      [{ ...policy, maxOutputTokens: estimate.outputTokens - 1 }, budget],
      [{ ...policy, maxEstimatedCostUsd: -1 }, budget],
      [policy, { ...budget, remainingTokens: budget.remainingTokens - 1 }],
      [policy, { ...budget, remainingCostUsd: -1 }],
    ];
    for (const [limitedPolicy, limitedBudget] of violations) {
      expect(() => assertDeterministicSummaryBudget(
        estimate, limitedPolicy, limitedBudget,
      )).toThrow('Summary model budget exceeded');
      expect(() => adapter.route(makeInput(true), limitedPolicy, limitedBudget))
        .toThrow('Summary model budget exceeded');
    }
  });
});
