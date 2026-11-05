import type { FactoryProvider } from '@nestjs/common';
import { readerValueScoringConfiguration } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config';
import { readerValueScoringProvider } from '@social-monitor/relevance/interfaces/rest/reader-value-scoring-provider-tokens';
import { readerSummaryV3Providers } from './summary-reader-summary-v3.providers';
import * as composition from '../../adapters/composition/reader-summary-v3-composition';
import { PrismaReaderSummaryJobRepository } from '../../adapters/persistence/prisma/prisma-reader-summary-job.repository';
import type { PrismaSummaryClient } from '../../adapters/persistence/prisma/prisma-summary-client';
import type { ReaderSummaryV3PreflightPort } from '../../ports';

const keys = ['READER_VALUE_SCORING_PROVIDER', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY'] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeEach(() => { for (const key of keys) delete process.env[key]; });
afterEach(() => {
  jest.restoreAllMocks();
  for (const key of keys) {
    const value = original[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it.each([undefined, 'openrouter-systemone', 'openai-decisions'] as const)(
  'API preflight injects selected %s identity without a scoring secret', (provider) => {
    if (provider !== undefined) process.env.READER_VALUE_SCORING_PROVIDER = provider;
    const create = jest.spyOn(composition, 'createReaderSummaryV3Preflight')
      .mockReturnValue({} as ReaderSummaryV3PreflightPort);
    const prisma = {} as PrismaSummaryClient;
    const factory = readerSummaryV3Providers[0] as FactoryProvider;
    factory.useFactory('prisma', prisma, new PrismaReaderSummaryJobRepository(prisma), { readCurrent: jest.fn() },
      readerValueScoringProvider.useFactory());
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[5].configuration)
      .toEqual(readerValueScoringConfiguration(provider ?? 'openrouter-systemone'));
  });
