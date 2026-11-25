import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JsonRankingEvalDatasetRepository } from './json-ranking-eval-dataset.repository';

const temporaryDirectories: string[] = [];

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('JsonRankingEvalDatasetRepository', () => {
  it('loads and validates a frozen ranking eval dataset', async () => {
    const path = writeDataset(makeDataset());
    const repository = new JsonRankingEvalDatasetRepository(path);

    const dataset = await repository.loadDataset();

    expect(dataset.datasetVersion).toBe('test-v1');
    expect(dataset.cases[0]?.candidates[0]?.publishedAt).toEqual(
      new Date('2026-07-04T00:00:00.000Z'),
    );
    expect(dataset.cases[0]?.labels[0]?.candidateId).toBe('candidate-1');
    expect(dataset.cases[0]?.queryPlannerIntent).toEqual({
      topic: 'AI coding agent reliability',
      sourceKeys: ['reddit'],
      products: ['Claude Code'],
      communities: [
        {
          name: 'ClaudeAI',
          sourceKey: 'reddit',
          listings: ['top', 'hot'],
        },
      ],
      maxLanesPerSource: 6,
      maxItemsPerLane: 25,
      includeEnrichment: true,
    });
  });

  it('rejects labels that reference unknown candidates', async () => {
    const baseCase = makeDataset().cases[0];
    if (baseCase === undefined) {
      throw new Error('Test fixture case is missing');
    }
    const path = writeDataset({
      ...makeDataset(),
      cases: [
        {
          ...baseCase,
          labels: [
            {
              candidateId: 'missing',
              relevance: 3,
              usefulness: 3,
              authority: 1,
              novelty: 1,
              confidence: 0.9,
            },
          ],
        },
      ],
    });
    const repository = new JsonRankingEvalDatasetRepository(path);

    await expect(repository.loadDataset()).rejects.toThrow(
      'candidateId references an unknown candidate',
    );
  });
});

const writeDataset = (dataset: unknown): string => {
  const directory = mkdtempSync(join(tmpdir(), 'ranking-eval-'));
  const path = join(directory, 'dataset.json');
  writeFileSync(path, JSON.stringify(dataset, null, 2));
  temporaryDirectories.push(directory);

  return path;
};

const makeDataset = () => ({
  schemaVersion: 1,
  datasetVersion: 'test-v1',
  generatedBy: 'test',
  labelingPolicy: 'test labels',
  cases: [
    {
      caseId: 'case-1',
      topic: 'AI coding agent reliability',
      sourceKeys: ['reddit'],
      queryPlannerIntent: {
        topic: 'AI coding agent reliability',
        sourceKeys: ['reddit'],
        products: ['Claude Code'],
        communities: [
          {
            name: 'ClaudeAI',
            sourceKey: 'reddit',
            listings: ['top', 'hot'],
          },
        ],
        maxLanesPerSource: 6,
        maxItemsPerLane: 25,
        includeEnrichment: true,
      },
      queryLanes: [
        {
          laneId: 'general',
          sourceKey: 'reddit',
          operation: 'search',
          query: 'AI coding agent reliability',
          maxItems: 10,
        },
      ],
      candidates: [
        {
          candidateId: 'candidate-1',
          providerKey: 'reddit',
          externalId: 'reddit:candidate-1',
          canonicalUrl: 'https://example.com/candidate-1',
          title: 'AI coding agent reliability',
          body: 'Useful source item',
          publishedAt: '2026-07-04T00:00:00.000Z',
          metadata: {
            score: 10,
          },
        },
      ],
      labels: [
        {
          candidateId: 'candidate-1',
          relevance: 3,
          usefulness: 3,
          authority: 1,
          novelty: 1,
          confidence: 0.9,
        },
      ],
    },
  ],
});
