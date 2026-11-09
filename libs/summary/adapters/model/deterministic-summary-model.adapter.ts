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
import { buildSummaryHeadline } from './deterministic-summary-headline';
import {
  assertDeterministicSummaryBudget,
  estimateDeterministicSummaryTokens,
} from './deterministic-summary-budget-policy';
import { formatSourceHighlight } from './deterministic-summary-source-highlights';
import { buildExecutiveSummary, buildNoSignalSummary } from './deterministic-summary-text';

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
    const firstItem = input.evidence.items[0];
    const usage = this.estimate(input, selectedRoute);
    const lineage = {
      promptVersion: selectedRoute.promptVersion,
      schemaVersion: selectedRoute.schemaVersion,
      modelVersion: selectedRoute.model,
      providerVersion: selectedRoute.provider,
      rulesVersion: input.policy.rulesVersion,
      evalDatasetVersion: 'summary.eval.mvp.v1',
    } as const;

    if (firstItem === undefined) {
      return {
        route: selectedRoute,
        draft: {
          headline: 'No reliable signal yet',
          executiveSummary: buildNoSignalSummary(input),
          keyPoints: [],
          risksAndUnknowns: [
            {
              description:
                'The summary window did not contain enough source material to produce claims.',
              reason: 'insufficient_evidence',
            },
          ],
          sourceHighlights: [],
          citationMap: [],
          qualityFlags: ['no_signal', 'limited_sources'],
          confidence: {
            level: 'none',
            score: 0,
            rationale: 'No evidence was selected for the summary window.',
          },
          lineage,
          usage,
          noSignalReason: 'No eligible evidence items selected for this interest.',
        },
      };
    }

    const selectedItems = input.evidence.items.slice(
      0,
      input.policy.maxKeyPoints,
    );
    const citationMap = selectedItems.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: 'title' as const,
      canonicalUrl: item.canonicalUrl,
    }));
    const keyPoints = selectedItems.map((item, index) => ({
      claim: item.title,
      citationIds: [`c${index + 1}`],
    }));

    return {
      route: selectedRoute,
      draft: {
        headline: buildSummaryHeadline(selectedItems),
        executiveSummary: buildExecutiveSummary(input),
        keyPoints,
        risksAndUnknowns: input.policy.includeRisks
          ? [
              {
                description:
                  'This deterministic MVP summary only uses selected evidence titles.',
                citationIds: ['c1'],
                reason: 'source_limit',
              },
            ]
          : [],
        sourceHighlights: input.policy.includeSourceHighlights
          ? selectedItems.map(formatSourceHighlight)
          : [],
        citationMap,
        qualityFlags:
          input.evidence.items.length < 3 ? ['limited_sources'] : [],
        confidence: {
          level: input.evidence.items.length < 3 ? 'low' : 'medium',
          score: input.evidence.items.length < 3 ? 0.35 : 0.6,
          rationale:
            'Confidence is derived from the number of selected evidence items in this MVP adapter.',
        },
        lineage,
        usage,
      },
    };
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

