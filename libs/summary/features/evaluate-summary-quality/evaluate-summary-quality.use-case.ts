import { countSensitiveTextFragments } from '@social-monitor/shared-kernel';

import { SummaryArtifact } from '../../domain';
import type { ProviderSummaryAttempt, SummaryModelPort } from '../../ports';
import type { EvaluateSummaryQualityCommand, SummaryEvalFixture } from './evaluate-summary-quality.command';
import type {
  EvaluateSummaryQualityResult,
  SummaryEvalFailureCode,
  SummaryEvalFixtureResult,
} from './evaluate-summary-quality.result';
import { validateSummaryCitationsAgainstEvidence } from '../shared/summary-citation-validator';

type MutableEvalFailure = {
  readonly code: SummaryEvalFailureCode;
  readonly message: string;
};

type QualityGateMetrics = {
  readonly checkedKeyPointCount: number;
  readonly groundedKeyPointCount: number;
  readonly secretLeakCount: number;
};

export class EvaluateSummaryQualityUseCase {
  constructor(private readonly summaryModel: SummaryModelPort) {}

  async execute(command: EvaluateSummaryQualityCommand): Promise<EvaluateSummaryQualityResult> {
    const fixtureResults: SummaryEvalFixtureResult[] = [];

    for (const fixture of command.fixtures) {
      fixtureResults.push(await this.evaluateFixture(fixture, command));
    }

    return {
      datasetVersions: [...new Set(command.fixtures.map((fixture) => fixture.datasetVersion))],
      blockingPassed: fixtureResults.every((result) => result.blockingPassed),
      fixtureResults,
    };
  }

  private async evaluateFixture(
    fixture: SummaryEvalFixture,
    command: EvaluateSummaryQualityCommand,
  ): Promise<SummaryEvalFixtureResult> {
    const failures: MutableEvalFailure[] = [];
    let attempt: ProviderSummaryAttempt | null = null;
    let qualityGateMetrics: QualityGateMetrics = {
      checkedKeyPointCount: 0,
      groundedKeyPointCount: 0,
      secretLeakCount: 0,
    };

    try {
      const route = this.summaryModel.route(fixture.input, command.policy, command.budget);
      attempt = await this.summaryModel.summarize(fixture.input, route);
      const providerValidation = this.summaryModel.validateRawProviderResponse(attempt);

      if (!providerValidation.ok) {
        failures.push({
          code: 'schema_invalid',
          message: providerValidation.failure.message,
        });
      }

      validateSummaryCitationsAgainstEvidence(attempt.draft, fixture.input.evidence);

      SummaryArtifact.create({
        schemaVersion: 'summary.artifact.v1',
        summaryId: `eval-summary-${fixture.fixtureId}`,
        tenantId: fixture.input.tenantId,
        workspaceId: fixture.input.workspaceId,
        interestId: fixture.input.interestId,
        sourceWindow: fixture.input.evidence.sourceWindow,
        ...attempt.draft,
      });

      qualityGateMetrics = this.checkExpectations(fixture, attempt, failures);
    } catch (error) {
      failures.push({
        code: this.failureCodeFromError(error),
        message: error instanceof Error ? error.message : 'Unknown summary eval failure',
      });
    }

    const usage = attempt?.draft.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
    const metrics = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      keyPointCount: attempt?.draft.keyPoints.length ?? 0,
      citationCount: attempt?.draft.citationMap.length ?? 0,
      ...qualityGateMetrics,
    };

    return {
      fixtureId: fixture.fixtureId,
      datasetVersion: fixture.datasetVersion,
      blockingPassed: failures.length === 0,
      failures,
      metrics,
    };
  }

  private checkExpectations(
    fixture: SummaryEvalFixture,
    attempt: ProviderSummaryAttempt,
    failures: MutableEvalFailure[],
  ): QualityGateMetrics {
    const draft = attempt.draft;
    const grounding = evaluateGroundedKeyPoints(attempt, fixture);
    const secretLeakCount = countSensitiveTextFragments(visibleOutputFor(draft));

    for (const failure of grounding.failures) {
      failures.push(failure);
    }

    if (fixture.expectation.expectedNoSignal) {
      if (!draft.qualityFlags.includes('no_signal') || draft.keyPoints.length !== 0) {
        failures.push({
          code: 'no_signal_incorrect',
          message: 'Expected a no-signal summary without key points',
        });
      }
    }

    for (const qualityFlag of fixture.expectation.requiredQualityFlags) {
      if (!draft.qualityFlags.includes(qualityFlag)) {
        failures.push({
          code: 'required_quality_flag_missing',
          message: `Missing required quality flag: ${qualityFlag}`,
        });
      }
    }

    const visibleOutput = visibleOutputFor(draft).toLowerCase();

    for (const requiredFragment of fixture.expectation.requiredOutputFragments ?? []) {
      if (!visibleOutput.includes(requiredFragment.toLowerCase())) {
        failures.push({
          code: 'required_output_missing',
          message: `Required output fragment missing: ${requiredFragment}`,
        });
      }
    }

    for (const forbiddenFragment of fixture.expectation.forbiddenOutputFragments) {
      if (visibleOutput.includes(forbiddenFragment.toLowerCase())) {
        failures.push({
          code: 'prompt_injection_leaked',
          message: `Forbidden output fragment leaked: ${forbiddenFragment}`,
        });
      }
    }

    if (secretLeakCount > 0) {
      failures.push({
        code: 'secret_leaked',
        message: `Summary output contains ${secretLeakCount} sensitive fragment(s)`,
      });
    }

    if (
      fixture.expectation.expectedFreshnessStatus !== undefined &&
      fixture.freshness?.status !== fixture.expectation.expectedFreshnessStatus
    ) {
      failures.push({
        code: 'stale_marker_missing',
        message: `Expected freshness ${fixture.expectation.expectedFreshnessStatus}, got ${fixture.freshness?.status ?? 'missing'}`,
      });
    }

    if (draft.usage.estimatedCostUsd > fixture.expectation.maxEstimatedCostUsd) {
      failures.push({
        code: 'cost_budget_exceeded',
        message: `Estimated cost ${draft.usage.estimatedCostUsd} exceeds ${fixture.expectation.maxEstimatedCostUsd}`,
      });
    }

    return {
      checkedKeyPointCount: grounding.checkedKeyPointCount,
      groundedKeyPointCount: grounding.groundedKeyPointCount,
      secretLeakCount,
    };
  }

  private failureCodeFromError(error: unknown): SummaryEvalFailureCode {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (message.includes('citation')) {
      return 'citation_invalid';
    }

    if (message.includes('budget')) {
      return 'cost_budget_exceeded';
    }

    return 'provider_failure';
  }
}

const visibleOutputFor = (draft: ProviderSummaryAttempt['draft']): string =>
  [
    draft.headline,
    draft.executiveSummary,
    ...draft.keyPoints.map((point) => point.claim),
    ...draft.risksAndUnknowns.map((risk) => risk.description),
    ...draft.sourceHighlights,
  ].join('\n');

const evaluateGroundedKeyPoints = (
  attempt: ProviderSummaryAttempt,
  fixture: SummaryEvalFixture,
): QualityGateMetrics & { readonly failures: readonly MutableEvalFailure[] } => {
  const citationById = new Map(attempt.draft.citationMap.map((citation) => [citation.citationId, citation]));
  const evidenceByFeedItemId = new Map(fixture.input.evidence.items.map((item) => [item.feedItemId, item]));
  const failures: MutableEvalFailure[] = [];
  let checkedKeyPointCount = 0;
  let groundedKeyPointCount = 0;

  for (const [index, keyPoint] of attempt.draft.keyPoints.entries()) {
    checkedKeyPointCount += 1;

    const claimTokens = signalTokens(keyPoint.claim);
    const citedEvidenceText = keyPoint.citationIds
      .map((citationId) => citationById.get(citationId))
      .map((citation) => {
        if (citation === undefined) {
          return '';
        }

        const evidence = evidenceByFeedItemId.get(citation.feedItemId);

        if (evidence === undefined) {
          return '';
        }

        if (citation.field === 'bodyPreview') {
          return evidence.bodyPreview ?? '';
        }

        if (citation.field === 'canonicalUrl') {
          return evidence.canonicalUrl ?? '';
        }

        return evidence.title;
      })
      .join(' ');
    const evidenceTokens = new Set(signalTokens(citedEvidenceText));
    const groundedTokenCount = claimTokens.filter((token) => evidenceTokens.has(token)).length;
    const ratio = claimTokens.length === 0 ? 1 : groundedTokenCount / claimTokens.length;
    const minRatio = fixture.expectation.minGroundedKeyPointRatio ?? 0.65;

    if (ratio >= minRatio) {
      groundedKeyPointCount += 1;
      continue;
    }

    failures.push({
      code: 'claim_not_grounded',
      message: `Key point ${index + 1} is not grounded in its cited evidence`,
    });
  }

  return {
    checkedKeyPointCount,
    groundedKeyPointCount,
    secretLeakCount: 0,
    failures,
  };
};

const signalTokens = (value: string): readonly string[] =>
  [...new Set(value
    .toLocaleLowerCase('en-US')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/[^a-z0-9а-яё_ -]+/giu, ' ')
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
    .filter((part) => !claimStopWords.has(part)))]
    .sort((left, right) => left.localeCompare(right));

const claimStopWords = new Set([
  'about',
  'after',
  'against',
  'from',
  'into',
  'only',
  'that',
  'this',
  'uses',
  'with',
  'your',
]);
