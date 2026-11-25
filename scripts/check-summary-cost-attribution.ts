import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { staticSummaryEvalFixtures } from '../libs/summary/adapters/eval/static-summary-eval.fixtures';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import { BuildSummaryCostAttributionUseCase } from '../libs/summary/features/build-summary-cost-attribution/build-summary-cost-attribution.use-case';
import { EvaluateSummaryQualityUseCase } from '../libs/summary/features/evaluate-summary-quality/evaluate-summary-quality.use-case';
import type { SummaryModelBudget, SummaryModelPolicy } from '../libs/summary/ports';

const outputPath = 'ops/cost/summary-cost-attribution.json';
const update = process.argv.includes('--update');

const policy: SummaryModelPolicy = {
  preferredProvider: 'deterministic-local',
  maxInputTokens: 12_000,
  maxOutputTokens: 1_500,
  maxEstimatedCostUsd: 0.5,
};
const budget: SummaryModelBudget = {
  remainingTokens: 20_000,
  remainingCostUsd: 1,
};

void main();

async function main(): Promise<void> {
  const summaryModel = new DeterministicSummaryModelAdapter();
  const evalResult = await new EvaluateSummaryQualityUseCase(summaryModel).execute({
    fixtures: staticSummaryEvalFixtures,
    policy,
    budget,
  });
  const attribution = new BuildSummaryCostAttributionUseCase(summaryModel).execute({
    reportId: 'summary-cost-attribution-mvp-v1',
    generatedBy: 'npm run check:summary-cost',
    fixtures: staticSummaryEvalFixtures,
    evalResult,
    policy,
    budget,
  });
  const serialized = `${JSON.stringify(attribution.report, null, 2)}\n`;

  if (!attribution.blockingPassed) {
    console.error(serialized);
    throw new Error('Summary cost attribution failed');
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing. Run npm run check:summary-cost -- --update`);
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, 'utf8'));

  if (expected !== serialized) {
    throw new Error(`${outputPath} is stale. Run npm run check:summary-cost -- --update`);
  }

  console.log(
    `Summary cost attribution OK (${attribution.report.totals.attributedFixtureCount} fixtures, cost $${attribution.report.totals.estimatedCostUsd.toFixed(6)})`,
  );
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n');
}
