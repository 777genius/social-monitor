import { Test } from '@nestjs/testing';
import { CircuitBreakerSourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { MetricsRuntimeModule } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { DefaultSocialResearchExecutionPolicy } from '@social-monitor/social-research';
import {
  PrismaSocialResearchResultCache,
  type PrismaSocialResearchResultCacheClient,
} from '@social-monitor/social-research/cache';
import { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

import { SocialResearchRuntimeModule } from './social-research-runtime.module';
import {
  SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT,
  SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS,
  SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE,
  SOCIAL_RESEARCH_RUNTIME_SETTINGS,
  type SocialResearchRuntimeSettings,
} from './social-research-runtime-settings';

describe('SocialResearchRuntimeModule', () => {
  it('builds source-fetcher backed social research handlers once for transports', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetricsRuntimeModule.register({
          serviceName: 'social-research-runtime-module-test',
        }),
        SocialResearchRuntimeModule,
      ],
    }).compile();

    try {
      expect(moduleRef.get(SocialResearchToolHandlers)).toBeInstanceOf(
        SocialResearchToolHandlers,
      );
      expect(moduleRef.get(CircuitBreakerSourceFetcherAdapter)).toBeInstanceOf(
        CircuitBreakerSourceFetcherAdapter,
      );
      expect(
        moduleRef.get(DefaultSocialResearchExecutionPolicy),
      ).toBeInstanceOf(DefaultSocialResearchExecutionPolicy);
      expect(
        moduleRef.get(SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE),
      ).toBeUndefined();
      expect(
        moduleRef.get(SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS),
      ).toMatchObject({
        executionAllowedRuntimeReadiness: ['fixture_ready', 'live_beta_ready'],
        warnWhenSourceReadinessMissing: true,
        sourceCapabilities: expect.arrayContaining([
          expect.objectContaining({
            sourceKey: 'reddit',
            supportedOperations: expect.arrayContaining(['search', 'listing']),
            readiness: expect.objectContaining({
              state: 'enabled_beta',
            }),
          }),
          expect.objectContaining({
            sourceKey: 'rss',
            supportedOperations: ['url'],
          }),
        ]),
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('wires Prisma result cache through the runtime composition root', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetricsRuntimeModule.register({
          serviceName: 'social-research-runtime-cache-module-test',
        }),
        SocialResearchRuntimeModule,
      ],
    })
      .overrideProvider(SOCIAL_RESEARCH_RUNTIME_SETTINGS)
      .useValue(prismaCacheSettings())
      .overrideProvider(SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT)
      .useValue(fakePrismaClient())
      .compile();

    try {
      expect(
        moduleRef.get(SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE),
      ).toBeInstanceOf(PrismaSocialResearchResultCache);
    } finally {
      await moduleRef.close();
    }
  });
});

const prismaCacheSettings = (): SocialResearchRuntimeSettings => ({
  executionPolicy: {
    requireExecutionScope: true,
    requireSourceBindings: true,
    includeCacheKeys: true,
  },
  resultCache: {
    mode: 'prisma',
    ttlMs: 300_000,
    maxEntries: 250,
  },
});

const fakePrismaClient = (): PrismaSocialResearchResultCacheClient => ({
  async $queryRaw<TValue = unknown>() {
    return [] as TValue;
  },
  async $executeRaw() {
    return 0;
  },
});
