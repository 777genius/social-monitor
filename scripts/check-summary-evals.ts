import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { staticSummaryEvalFixtures } from '../libs/summary/adapters/eval/static-summary-eval.fixtures';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import type { SummaryEvalFixtureGroup } from '../libs/summary/features/evaluate-summary-quality/evaluate-summary-quality.command';
import { EvaluateSummaryQualityUseCase } from '../libs/summary/features/evaluate-summary-quality/evaluate-summary-quality.use-case';
import type { SummaryModelBudget, SummaryModelPolicy } from '../libs/summary/ports';

const outputPath = 'ops/evals/summary-eval-output.json';
const update = process.argv.includes('--update');
const requiredFixtureGroups = new Set<SummaryEvalFixtureGroup>([
  'empty_no_signal',
  'hn_golden',
  'prompt_injection',
  'secret_redaction',
  'citation_regression',
  'stale_marker',
]);

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
  const result = await new EvaluateSummaryQualityUseCase(new DeterministicSummaryModelAdapter()).execute({
    fixtures: staticSummaryEvalFixtures,
    policy,
    budget,
  });
  const fixtureCount = result.fixtureResults.length;
  const failedFixtureCount = result.fixtureResults.filter((fixture) => !fixture.blockingPassed).length;
  const fixtureGroups = [...new Set(staticSummaryEvalFixtures.map((fixture) => fixture.group))].sort();
  const missingFixtureGroups = [...requiredFixtureGroups].filter((group) => !fixtureGroups.includes(group));
  const checkedKeyPointCount = result.fixtureResults.reduce(
    (total, fixture) => total + fixture.metrics.checkedKeyPointCount,
    0,
  );
  const groundedKeyPointCount = result.fixtureResults.reduce(
    (total, fixture) => total + fixture.metrics.groundedKeyPointCount,
    0,
  );
  const secretLeakCount = result.fixtureResults.reduce(
    (total, fixture) => total + fixture.metrics.secretLeakCount,
    0,
  );
  const report = {
    schemaVersion: 1,
    evalRunId: 'summary-eval-mvp-v1',
    generatedBy: 'npm run check:summary-evals',
    gitShaPolicy: 'release pipeline records the exact git sha next to this deterministic report',
    model: {
      provider: 'deterministic-local',
      model: 'summary-fake-v1',
      promptVersion: 'summary.prompt.v1',
      schemaVersion: 'summary.artifact.v1',
    },
    policy,
    budget,
    datasetVersions: result.datasetVersions,
    fixtureGroups,
    blockingPassed: result.blockingPassed && missingFixtureGroups.length === 0 && secretLeakCount === 0,
    totals: {
      fixtureCount,
      passedFixtureCount: fixtureCount - failedFixtureCount,
      failedFixtureCount,
      inputTokens: result.fixtureResults.reduce((total, fixture) => total + fixture.metrics.inputTokens, 0),
      outputTokens: result.fixtureResults.reduce((total, fixture) => total + fixture.metrics.outputTokens, 0),
      estimatedCostUsd: result.fixtureResults.reduce(
        (total, fixture) => total + fixture.metrics.estimatedCostUsd,
        0,
      ),
      checkedKeyPointCount,
      groundedKeyPointCount,
      secretLeakCount,
    },
    qualityGates: {
      requiredFixtureGroups: [...requiredFixtureGroups].sort(),
      missingFixtureGroups,
      hallucinationGuard: {
        checkedKeyPointCount,
        groundedKeyPointCount,
        blockingPassed: checkedKeyPointCount === groundedKeyPointCount,
      },
      secretRedactionGuard: {
        secretLeakCount,
        blockingPassed: secretLeakCount === 0,
      },
      staleMarkerGuard: {
        fixtureIds: staticSummaryEvalFixtures
          .filter((fixture) => fixture.expectation.expectedFreshnessStatus !== undefined)
          .map((fixture) => fixture.fixtureId),
        blockingPassed: staticSummaryEvalFixtures.some(
          (fixture) => fixture.expectation.expectedFreshnessStatus === 'stale',
        ),
      },
    },
    fixtureResults: result.fixtureResults,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error('Summary eval blocking fixtures failed');
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing. Run npm run check:summary-evals -- --update`);
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, 'utf8'));

  if (expected !== serialized) {
    throw new Error(`${outputPath} is stale. Run npm run check:summary-evals -- --update`);
  }

  const gitSha = readGitSha();
  console.log(`Summary evals OK (${fixtureCount} fixtures, git ${gitSha})`);
}

function readGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n');
}
