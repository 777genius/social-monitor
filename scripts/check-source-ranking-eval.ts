import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { JsonRankingEvalDatasetRepository } from '../libs/ingestion/adapters/eval/json-ranking-eval-dataset.repository';
import { SourceItemRankingCandidateProvider } from '../libs/ingestion/adapters/eval/source-item-ranking-candidate.provider';
import { RunSourceRankingEvalUseCase } from '../libs/ingestion/features/run-source-ranking-eval/run-source-ranking-eval.use-case';

const datasetPath = 'ops/evals/source-ranking-eval-dataset.v1.json';
const outputPath = 'ops/evals/source-ranking-eval-output.json';
const update = process.argv.includes('--update');

void main();

async function main(): Promise<void> {
  const useCase = new RunSourceRankingEvalUseCase(
    new JsonRankingEvalDatasetRepository(datasetPath),
    new SourceItemRankingCandidateProvider(),
  );
  const result = await useCase.execute({
    datasetVersion: 'source-ranking-silver-v1',
  });

  if (!result.ok) {
    throw result.error;
  }

  const report = {
    ...result.value,
    evalRunId: 'source-ranking-eval-v1',
    generatedBy: 'npm run check:source-ranking-eval',
    gitShaPolicy:
      'release pipeline records the exact git sha next to this deterministic report',
    datasetPath,
    model: {
      judge: 'none',
      rankingProvider: 'source-item-ranking-policy',
      liveNetwork: false,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error('Source ranking eval quality gates failed');
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:source-ranking-eval -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, 'utf8'));

  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:source-ranking-eval -- --update`,
    );
  }

  console.log(
    `Source ranking eval OK (${report.caseResults.length} cases, git ${readGitSha()})`,
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
