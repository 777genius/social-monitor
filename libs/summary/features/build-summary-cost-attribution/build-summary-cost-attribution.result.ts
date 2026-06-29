import type { SummaryModelBudget, SummaryModelPolicy } from '../../ports';

export type SummaryCostAttributionUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly estimatedCostMicroUsd: number;
};

export type SummaryCostAttributionRow = {
  readonly fixtureId: string;
  readonly datasetVersion: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly sourceWindowId: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly usage: SummaryCostAttributionUsage;
  readonly maxFixtureCostUsd: number;
};

export type SummaryCostAttributionInterestAggregate = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly fixtureCount: number;
  readonly usage: SummaryCostAttributionUsage;
};

export type SummaryCostAttributionModelAggregate = {
  readonly provider: string;
  readonly model: string;
  readonly fixtureCount: number;
  readonly usage: SummaryCostAttributionUsage;
};

export type SummaryCostAttributionReport = {
  readonly schemaVersion: 1;
  readonly reportId: string;
  readonly generatedBy: string;
  readonly attributionMode: 'summary_eval_preflight';
  readonly datasetVersions: readonly string[];
  readonly policy: SummaryModelPolicy;
  readonly budget: SummaryModelBudget;
  readonly blockingPassed: boolean;
  readonly totals: SummaryCostAttributionUsage & {
    readonly fixtureCount: number;
    readonly attributedFixtureCount: number;
  };
  readonly rows: readonly SummaryCostAttributionRow[];
  readonly aggregates: {
    readonly byTenantWorkspaceInterest: readonly SummaryCostAttributionInterestAggregate[];
    readonly byProviderModel: readonly SummaryCostAttributionModelAggregate[];
  };
  readonly violations: readonly string[];
};

export type BuildSummaryCostAttributionResult = {
  readonly blockingPassed: boolean;
  readonly report: SummaryCostAttributionReport;
};
