import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { staticSummaryEvalFixtures } from '@social-monitor/summary/adapters/eval/static-summary-eval.fixtures';
import { EvaluateSummaryQualityUseCase } from '@social-monitor/summary/features/evaluate-summary-quality/evaluate-summary-quality.use-case';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary eval quality gates (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs blocking summary eval fixtures against the configured model adapter', async () => {
    const result = await app.get(EvaluateSummaryQualityUseCase).execute({
      fixtures: staticSummaryEvalFixtures,
      policy: {
        preferredProvider: 'deterministic-local',
        maxInputTokens: 12_000,
        maxOutputTokens: 1_500,
        maxEstimatedCostUsd: 0.5,
      },
      budget: {
        remainingTokens: 20_000,
        remainingCostUsd: 1,
      },
    });

    expect(result.blockingPassed).toBe(true);
    expect(result.datasetVersions).toEqual(['summary.eval.mvp.v1']);
    expect(result.fixtureResults).toHaveLength(3);
  });
});
