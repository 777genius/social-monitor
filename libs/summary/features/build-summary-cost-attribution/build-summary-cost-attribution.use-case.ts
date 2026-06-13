import type { SummaryModelPort } from '../../ports';
import type { BuildSummaryCostAttributionCommand } from './build-summary-cost-attribution.command';
import type {
  BuildSummaryCostAttributionResult,
  SummaryCostAttributionModelAggregate,
  SummaryCostAttributionReport,
  SummaryCostAttributionRow,
  SummaryCostAttributionTopicAggregate,
  SummaryCostAttributionUsage,
} from './build-summary-cost-attribution.result';

const microUsdMultiplier = 1_000_000;

export class BuildSummaryCostAttributionUseCase {
  constructor(private readonly summaryModel: SummaryModelPort) {}

  execute(command: BuildSummaryCostAttributionCommand): BuildSummaryCostAttributionResult {
    const violations: string[] = [];
    const rows: SummaryCostAttributionRow[] = [];
    const evalResultsByFixtureId = new Map(
      command.evalResult.fixtureResults.map((result) => [result.fixtureId, result]),
    );

    for (const fixture of command.fixtures) {
      const evalFixtureResult = evalResultsByFixtureId.get(fixture.fixtureId);

      if (evalFixtureResult === undefined) {
        violations.push(`${fixture.fixtureId}: missing eval result`);
        continue;
      }

      try {
        const route = this.summaryModel.route(fixture.input, command.policy, command.budget);
        const estimate = this.summaryModel.estimate(fixture.input, route);
        const usage = this.toUsage(fixture.fixtureId, estimate.inputTokens, estimate.outputTokens, estimate.estimatedCostUsd);

        if (usage === null) {
          violations.push(`${fixture.fixtureId}: invalid usage estimate`);
          continue;
        }

        const evalCostMicroUsd = this.toCostMicroUsd(evalFixtureResult.metrics.estimatedCostUsd);

        if (
          evalFixtureResult.metrics.inputTokens !== usage.inputTokens ||
          evalFixtureResult.metrics.outputTokens !== usage.outputTokens ||
          evalCostMicroUsd !== usage.estimatedCostMicroUsd
        ) {
          violations.push(`${fixture.fixtureId}: eval metrics do not match model preflight estimate`);
        }

        if (usage.estimatedCostUsd > fixture.expectation.maxEstimatedCostUsd) {
          violations.push(
            `${fixture.fixtureId}: estimated cost ${usage.estimatedCostUsd} exceeds fixture max ${fixture.expectation.maxEstimatedCostUsd}`,
          );
        }

        if (usage.estimatedCostUsd > command.policy.maxEstimatedCostUsd) {
          violations.push(
            `${fixture.fixtureId}: estimated cost ${usage.estimatedCostUsd} exceeds policy max ${command.policy.maxEstimatedCostUsd}`,
          );
        }

        rows.push({
          fixtureId: fixture.fixtureId,
          datasetVersion: fixture.datasetVersion,
          tenantId: String(fixture.input.tenantId),
          workspaceId: String(fixture.input.workspaceId),
          topicId: fixture.input.topicId,
          sourceWindowId: fixture.input.evidence.sourceWindow.windowId,
          provider: route.provider,
          model: route.model,
          promptVersion: route.promptVersion,
          schemaVersion: route.schemaVersion,
          usage,
          maxFixtureCostUsd: fixture.expectation.maxEstimatedCostUsd,
        });
      } catch (error) {
        violations.push(
          `${fixture.fixtureId}: cost attribution failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    const totals = this.sumUsage(rows.map((row) => row.usage));
    const totalBudgetCostMicroUsd = this.toCostMicroUsd(command.budget.remainingCostUsd);

    if (totals.inputTokens + totals.outputTokens > command.budget.remainingTokens) {
      violations.push(
        `total token estimate ${totals.inputTokens + totals.outputTokens} exceeds budget ${command.budget.remainingTokens}`,
      );
    }

    if (totals.estimatedCostMicroUsd > totalBudgetCostMicroUsd) {
      violations.push(
        `total estimated cost ${totals.estimatedCostUsd} exceeds budget ${command.budget.remainingCostUsd}`,
      );
    }

    if (rows.length !== command.fixtures.length) {
      violations.push(`only ${rows.length} of ${command.fixtures.length} fixtures have cost attribution rows`);
    }

    const report: SummaryCostAttributionReport = {
      schemaVersion: 1,
      reportId: command.reportId,
      generatedBy: command.generatedBy,
      attributionMode: 'summary_eval_preflight',
      datasetVersions: [...new Set(command.fixtures.map((fixture) => fixture.datasetVersion))],
      policy: command.policy,
      budget: command.budget,
      blockingPassed: command.evalResult.blockingPassed && violations.length === 0,
      totals: {
        fixtureCount: command.fixtures.length,
        attributedFixtureCount: rows.length,
        ...totals,
      },
      rows,
      aggregates: {
        byTenantWorkspaceTopic: this.aggregateByTenantWorkspaceTopic(rows),
        byProviderModel: this.aggregateByProviderModel(rows),
      },
      violations,
    };

    return {
      blockingPassed: report.blockingPassed,
      report,
    };
  }

  private toUsage(
    fixtureId: string,
    inputTokens: number,
    outputTokens: number,
    estimatedCostUsd: number,
  ): SummaryCostAttributionUsage | null {
    if (
      !Number.isInteger(inputTokens) ||
      !Number.isInteger(outputTokens) ||
      inputTokens < 0 ||
      outputTokens < 0 ||
      !Number.isFinite(estimatedCostUsd) ||
      estimatedCostUsd < 0
    ) {
      void fixtureId;
      return null;
    }

    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd: this.fromCostMicroUsd(this.toCostMicroUsd(estimatedCostUsd)),
      estimatedCostMicroUsd: this.toCostMicroUsd(estimatedCostUsd),
    };
  }

  private aggregateByTenantWorkspaceTopic(rows: readonly SummaryCostAttributionRow[]): SummaryCostAttributionTopicAggregate[] {
    const aggregates = new Map<string, { rows: SummaryCostAttributionRow[]; sample: SummaryCostAttributionRow }>();

    for (const row of rows) {
      const key = `${row.tenantId}\u0000${row.workspaceId}\u0000${row.topicId}`;
      const aggregate = aggregates.get(key);

      if (aggregate === undefined) {
        aggregates.set(key, { rows: [row], sample: row });
      } else {
        aggregate.rows.push(row);
      }
    }

    return [...aggregates.values()].map((aggregate) => ({
      tenantId: aggregate.sample.tenantId,
      workspaceId: aggregate.sample.workspaceId,
      topicId: aggregate.sample.topicId,
      fixtureCount: aggregate.rows.length,
      usage: this.sumUsage(aggregate.rows.map((row) => row.usage)),
    }));
  }

  private aggregateByProviderModel(rows: readonly SummaryCostAttributionRow[]): SummaryCostAttributionModelAggregate[] {
    const aggregates = new Map<string, { rows: SummaryCostAttributionRow[]; sample: SummaryCostAttributionRow }>();

    for (const row of rows) {
      const key = `${row.provider}\u0000${row.model}`;
      const aggregate = aggregates.get(key);

      if (aggregate === undefined) {
        aggregates.set(key, { rows: [row], sample: row });
      } else {
        aggregate.rows.push(row);
      }
    }

    return [...aggregates.values()].map((aggregate) => ({
      provider: aggregate.sample.provider,
      model: aggregate.sample.model,
      fixtureCount: aggregate.rows.length,
      usage: this.sumUsage(aggregate.rows.map((row) => row.usage)),
    }));
  }

  private sumUsage(usages: readonly SummaryCostAttributionUsage[]): SummaryCostAttributionUsage {
    const estimatedCostMicroUsd = usages.reduce((total, usage) => total + usage.estimatedCostMicroUsd, 0);

    return {
      inputTokens: usages.reduce((total, usage) => total + usage.inputTokens, 0),
      outputTokens: usages.reduce((total, usage) => total + usage.outputTokens, 0),
      estimatedCostUsd: this.fromCostMicroUsd(estimatedCostMicroUsd),
      estimatedCostMicroUsd,
    };
  }

  private toCostMicroUsd(estimatedCostUsd: number): number {
    return Math.round(estimatedCostUsd * microUsdMultiplier);
  }

  private fromCostMicroUsd(estimatedCostMicroUsd: number): number {
    return estimatedCostMicroUsd / microUsdMultiplier;
  }
}
