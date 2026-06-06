import { SummaryArtifact } from '../../domain';
import type { ProviderSummaryAttempt, SummaryModelPort } from '../../ports';
import type { EvaluateSummaryQualityCommand, SummaryEvalFixture } from './evaluate-summary-quality.command';
import type {
  EvaluateSummaryQualityResult,
  SummaryEvalFailureCode,
  SummaryEvalFixtureResult,
} from './evaluate-summary-quality.result';

type MutableEvalFailure = {
  readonly code: SummaryEvalFailureCode;
  readonly message: string;
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

      SummaryArtifact.create({
        schemaVersion: 'summary.artifact.v1',
        summaryId: `eval-summary-${fixture.fixtureId}`,
        tenantId: fixture.input.tenantId,
        workspaceId: fixture.input.workspaceId,
        topicId: fixture.input.topicId,
        sourceWindow: fixture.input.evidence.sourceWindow,
        ...attempt.draft,
      });

      this.checkExpectations(fixture, attempt, failures);
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
  ): void {
    const draft = attempt.draft;

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

    const visibleOutput = [
      draft.headline,
      draft.executiveSummary,
      ...draft.keyPoints.map((point) => point.claim),
      ...draft.risksAndUnknowns.map((risk) => risk.description),
      ...draft.sourceHighlights,
    ].join('\n').toLowerCase();

    for (const forbiddenFragment of fixture.expectation.forbiddenOutputFragments) {
      if (visibleOutput.includes(forbiddenFragment.toLowerCase())) {
        failures.push({
          code: 'prompt_injection_leaked',
          message: `Forbidden output fragment leaked: ${forbiddenFragment}`,
        });
      }
    }

    if (draft.usage.estimatedCostUsd > fixture.expectation.maxEstimatedCostUsd) {
      failures.push({
        code: 'cost_budget_exceeded',
        message: `Estimated cost ${draft.usage.estimatedCostUsd} exceeds ${fixture.expectation.maxEstimatedCostUsd}`,
      });
    }
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
