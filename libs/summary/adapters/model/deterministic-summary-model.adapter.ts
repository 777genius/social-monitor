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

const route: SummaryModelRoute = {
  provider: 'deterministic-local',
  model: 'summary-fake-v1',
  promptVersion: 'summary.prompt.v1',
  schemaVersion: 'summary.artifact.v1',
};

export class DeterministicSummaryModelAdapter implements SummaryModelPort {
  route(input: SummaryModelInput, policy: SummaryModelPolicy, budget: SummaryModelBudget): SummaryModelRoute {
    const estimate = this.estimate(input, route);

    if (
      estimate.inputTokens > policy.maxInputTokens ||
      estimate.outputTokens > policy.maxOutputTokens ||
      estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
      estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
      estimate.estimatedCostUsd > budget.remainingCostUsd
    ) {
      throw new Error('Summary model budget exceeded');
    }

    return route;
  }

  estimate(input: SummaryModelInput, selectedRoute: SummaryModelRoute): SummaryModelEstimate {
    void selectedRoute;

    const evidenceTextLength = input.evidence.items.reduce(
      (total, item) => total + item.title.length + (item.bodyPreview?.length ?? 0),
      0,
    );
    const memoryTextLength = input.memoryContext?.renderedText?.length ?? 0;
    const inputTokens = Math.ceil((input.topicId.length + evidenceTextLength + memoryTextLength) / 4);
    const outputTokens = input.evidence.items.length === 0 ? 48 : 160;

    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd: 0,
    };
  }

  async summarize(input: SummaryModelInput, selectedRoute: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
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
              description: 'The summary window did not contain enough source material to produce claims.',
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
          noSignalReason: 'No eligible evidence items selected for this topic.',
        },
      };
    }

    const selectedItems = input.evidence.items.slice(0, input.policy.maxKeyPoints);
    const citationMap = selectedItems.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: 'title' as const,
    }));
    const keyPoints = selectedItems.map((item, index) => ({
      claim: item.title,
      citationIds: [`c${index + 1}`],
    }));

    return {
      route: selectedRoute,
      draft: {
        headline: firstItem.title,
        executiveSummary: buildExecutiveSummary(input),
        keyPoints,
        risksAndUnknowns: input.policy.includeRisks
          ? [
              {
                description: 'This deterministic MVP summary only uses selected evidence titles.',
                citationIds: ['c1'],
                reason: 'source_limit',
              },
            ]
          : [],
        sourceHighlights: input.policy.includeSourceHighlights ? selectedItems.map(formatSourceHighlight) : [],
        citationMap,
        qualityFlags: input.evidence.items.length < 3 ? ['limited_sources'] : [],
        confidence: {
          level: input.evidence.items.length < 3 ? 'low' : 'medium',
          score: input.evidence.items.length < 3 ? 0.35 : 0.6,
          rationale: 'Confidence is derived from the number of selected evidence items in this MVP adapter.',
        },
        lineage,
        usage,
      },
    };
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
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
    const message = error instanceof Error ? error.message : 'Unknown summary model error';

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

const buildExecutiveSummary = (input: SummaryModelInput): string => {
  const formatLabel = input.policy.format.replace('_', ' ');
  const toneLabel = input.policy.tone;
  const languageLabel = input.policy.language === 'auto' ? 'source language' : input.policy.language;
  const base = `Current ${formatLabel} uses ${input.evidence.items.length} selected item(s), ${toneLabel} tone, ${languageLabel}.`;

  if (input.policy.customInstructions === undefined) {
    return appendMemoryContext(base, input);
  }

  return appendMemoryContext(`${base} Custom focus: ${input.policy.customInstructions}`, input);
};

const formatSourceHighlight = (item: SummaryModelInput['evidence']['items'][number]): string => {
  const why = item.relevance?.whyImportant[0];

  return why === undefined ? item.title : `${item.title} (${why})`;
};

const buildNoSignalSummary = (input: SummaryModelInput): string => {
  const base = 'No eligible evidence items were available for this topic window.';

  if (input.policy.customInstructions === undefined) {
    return appendMemoryContext(base, input);
  }

  return appendMemoryContext(`${base} Custom focus: ${input.policy.customInstructions}`, input);
};

const appendMemoryContext = (base: string, input: SummaryModelInput): string => {
  const memory = input.memoryContext;
  if (memory?.status !== 'available' || memory.renderedText === undefined || memory.renderedText.trim().length === 0) {
    return base;
  }

  return `${base} Memory context: ${memory.renderedText.trim().slice(0, 500)}`;
};
