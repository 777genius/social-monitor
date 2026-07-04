import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import {
  buildBaselineSourceQueryPlan,
  DEFAULT_SOURCE_QUERY_PLANNER_EVAL_QUALITY_GATES,
  defaultSourceQueryPlannerIntent,
  evaluateSourceQueryPlannerCase,
  evaluateSourceQueryPlannerSuite,
  type SourceQueryPlannerEvalCaseResult,
} from '../../domain';
import type {
  EvalDatasetRepositoryPort,
  SourceQueryPlannerPort,
} from '../../ports';
import type { RunSourceQueryPlannerEvalCommand } from './run-source-query-planner-eval.command';
import type { RunSourceQueryPlannerEvalResult } from './run-source-query-planner-eval.result';

type RunSourceQueryPlannerEvalFailure = DomainError | Error;

export class RunSourceQueryPlannerEvalUseCase {
  constructor(
    private readonly datasets: EvalDatasetRepositoryPort,
    private readonly planner: SourceQueryPlannerPort,
  ) {}

  async execute(
    command: RunSourceQueryPlannerEvalCommand = {},
  ): Promise<Result<RunSourceQueryPlannerEvalResult, RunSourceQueryPlannerEvalFailure>> {
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
          'Query planner eval dataset version mismatch',
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
          'Query planner eval dataset must contain at least one case',
        ),
      );
    }

    const caseResults: SourceQueryPlannerEvalCaseResult[] = [];
    for (const evalCase of dataset.cases) {
      const intent =
        evalCase.queryPlannerIntent ??
        defaultSourceQueryPlannerIntent(evalCase);
      const experimentPlan = await this.planner.compilePlan({ intent });
      caseResults.push(
        evaluateSourceQueryPlannerCase({
          evalCase,
          baselinePlan: buildBaselineSourceQueryPlan(intent),
          experimentPlan,
        }),
      );
    }

    const qualityGates =
      command.qualityGates ?? DEFAULT_SOURCE_QUERY_PLANNER_EVAL_QUALITY_GATES;
    const suite = evaluateSourceQueryPlannerSuite({
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
      blockingPassed: suite.blockingPassed,
      metrics: suite.metrics,
      caseResults: suite.caseResults,
    });
  }
}
