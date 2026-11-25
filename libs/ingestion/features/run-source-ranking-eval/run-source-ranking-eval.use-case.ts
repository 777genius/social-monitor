import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import {
  DEFAULT_RANKING_EVAL_QUALITY_GATES,
  evaluateRankingEvalCase,
  evaluateRankingEvalSuite,
  type RankingEvalCaseResult,
} from '../../domain';
import type {
  EvalDatasetRepositoryPort,
  RankingCandidateProviderPort,
} from '../../ports';
import type { RunSourceRankingEvalCommand } from './run-source-ranking-eval.command';
import type { RunSourceRankingEvalResult } from './run-source-ranking-eval.result';

type RunSourceRankingEvalFailure = DomainError | Error;

export class RunSourceRankingEvalUseCase {
  constructor(
    private readonly datasets: EvalDatasetRepositoryPort,
    private readonly candidateProvider: RankingCandidateProviderPort,
  ) {}

  async execute(
    command: RunSourceRankingEvalCommand = {},
  ): Promise<Result<RunSourceRankingEvalResult, RunSourceRankingEvalFailure>> {
    const dataset = await this.datasets.loadDataset({
      datasetVersion: command.datasetVersion,
    });

    if (
      command.datasetVersion !== undefined &&
      dataset.datasetVersion !== command.datasetVersion
    ) {
      return err(
        new DomainError(
          'validation.failed',
          'Ranking eval dataset version mismatch',
          {
            expectedDatasetVersion: command.datasetVersion,
            actualDatasetVersion: dataset.datasetVersion,
          },
        ),
      );
    }

    if (dataset.cases.length === 0) {
      return err(
        new DomainError(
          'validation.failed',
          'Ranking eval dataset must contain at least one case',
        ),
      );
    }

    const caseResults: RankingEvalCaseResult[] = [];
    for (const evalCase of dataset.cases) {
      const ranking = await this.candidateProvider.rankCandidates({ evalCase });
      caseResults.push(
        evaluateRankingEvalCase({
          evalCase,
          rankedCandidateIds: ranking.rankedCandidateIds,
          rankingMetadata: ranking.metadata,
        }),
      );
    }

    const qualityGates =
      command.qualityGates ??
      dataset.qualityGates ??
      DEFAULT_RANKING_EVAL_QUALITY_GATES;
    const suiteResult = evaluateRankingEvalSuite({
      datasetVersion: dataset.datasetVersion,
      caseResults,
      qualityGates,
    });

    return ok({
      schemaVersion: 1,
      datasetVersion: dataset.datasetVersion,
      generatedBy: dataset.generatedBy,
      labelingPolicy: dataset.labelingPolicy,
      qualityGates,
      blockingPassed: suiteResult.blockingPassed,
      metrics: suiteResult.metrics,
      caseResults: suiteResult.caseResults,
    });
  }
}
