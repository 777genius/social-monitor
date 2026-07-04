import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { JsonRankingEvalDatasetRepository } from '../libs/ingestion/adapters/eval/json-ranking-eval-dataset.repository';
import { SocialResearchSourceQueryPlannerAdapter } from '../libs/ingestion/adapters/eval/social-research-source-query-planner.adapter';
import { RunSourceQueryPlannerEvalUseCase } from '../libs/ingestion/features/run-source-query-planner-eval/run-source-query-planner-eval.use-case';

const datasetPath = 'ops/evals/source-ranking-eval-dataset.v1.json';
const outputPath = 'ops/evals/source-query-planner-eval-output.json';
const update = process.argv.includes('--update');

void main();

async function main(): Promise<void> {
  const useCase = new RunSourceQueryPlannerEvalUseCase(
    new JsonRankingEvalDatasetRepository(datasetPath),
    new SocialResearchSourceQueryPlannerAdapter(),
  );
  const result = await useCase.execute({
    datasetVersion: 'source-ranking-silver-v1',
  });

  if (!result.ok) {
    throw result.error;
  }

  const report = {
    ...result.value,
    evalRunId: 'source-query-planner-eval-v1',
    generatedBy: 'npm run check:source-query-planner-eval',
    gitShaPolicy:
      'release pipeline records the exact git sha next to this deterministic report',
    datasetPath,
    model: {
      judge: 'none',
      baseline: 'single-topic-lane',
      experiment: 'social-research-query-planner',
      liveNetwork: false,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error('Source query planner eval quality gates failed');
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:source-query-planner-eval -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, 'utf8'));

  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:source-query-planner-eval -- --update`,
    );
  }

  console.log(
    `Source query planner eval OK (${report.caseResults.length} cases, git ${readGitSha()})`,
  );
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
