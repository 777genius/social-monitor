import { Module } from '@nestjs/common';
import { CircuitBreakerSourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { sourceProviderRegistryProviders } from '@social-monitor/ingestion/interfaces/source/source-provider-registry.providers';
import type { SourceProviderRegistryPort } from '@social-monitor/ingestion/ports';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { resolvePostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import {
  DefaultSocialResearchExecutionPolicy,
  type SocialSearchPlannerOptions,
  type SocialResearchResultCachePort,
} from '@social-monitor/social-research';
import {
  EphemeralSocialResearchResultCache,
  PrismaSocialResearchConnection,
  PrismaSocialResearchResultCache,
  type PrismaSocialResearchResultCacheClient,
} from '@social-monitor/social-research/cache';
import {
  createDefaultSourceFetcherLaneExecutionCompiler,
  socialSourceCapabilitiesFromRegistry,
  SourceFetcherSocialResearchGateway,
  SourceFetcherSocialThreadReader,
} from '@social-monitor/social-research/ingestion';
import { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';
import { SystemClock } from '@social-monitor/shared-kernel';

import {
  resolveSocialResearchRuntimeSettings,
  SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS,
  SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT,
  SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE,
  SOCIAL_RESEARCH_RUNTIME_SETTINGS,
  type SocialResearchRuntimeSettings,
} from './social-research-runtime-settings';

@Module({
  imports: [MonitoringRestModule],
  providers: [
    {
      provide: SOCIAL_RESEARCH_RUNTIME_SETTINGS,
      useFactory: () => resolveSocialResearchRuntimeSettings(process.env),
    },
    ...sourceProviderRegistryProviders,
    {
      provide: SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT,
      useFactory: async (
        settings: SocialResearchRuntimeSettings,
      ): Promise<PrismaSocialResearchResultCacheClient | undefined> =>
        settings.resultCache.mode === 'prisma'
          ? PrismaSocialResearchConnection.create(
              resolvePostgresRuntimePoolConfig(process.env),
            )
          : undefined,
      inject: [SOCIAL_RESEARCH_RUNTIME_SETTINGS],
    },
    {
      provide: SourceFetcherSocialThreadReader,
      useFactory: (sourceFetcher: CircuitBreakerSourceFetcherAdapter) =>
        new SourceFetcherSocialThreadReader(sourceFetcher),
      inject: [CircuitBreakerSourceFetcherAdapter],
    },
    {
      provide: SourceFetcherSocialResearchGateway,
      useFactory: (
        sourceFetcher: CircuitBreakerSourceFetcherAdapter,
        threadReader: SourceFetcherSocialThreadReader,
      ) =>
        new SourceFetcherSocialResearchGateway(sourceFetcher, {
          threadReader,
          laneExecutionCompiler:
            createDefaultSourceFetcherLaneExecutionCompiler(),
        }),
      inject: [
        CircuitBreakerSourceFetcherAdapter,
        SourceFetcherSocialThreadReader,
      ],
    },
    {
      provide: DefaultSocialResearchExecutionPolicy,
      useFactory: (
        settings: SocialResearchRuntimeSettings,
        plannerOptions: SocialSearchPlannerOptions,
      ) =>
        new DefaultSocialResearchExecutionPolicy({
          ...settings.executionPolicy,
          sourceCapabilities: plannerOptions.sourceCapabilities,
        }),
      inject: [
        SOCIAL_RESEARCH_RUNTIME_SETTINGS,
        SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS,
      ],
    },
    {
      provide: SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS,
      useFactory: async (
        registry: SourceProviderRegistryPort,
        settings: SocialResearchRuntimeSettings,
      ): Promise<SocialSearchPlannerOptions> => ({
        sourceCapabilities:
          await socialSourceCapabilitiesFromRegistry(registry),
        executionAllowedRuntimeReadiness:
          settings.executionPolicy.allowedRuntimeReadiness,
        warnWhenSourceReadinessMissing:
          settings.executionPolicy.requireSourceRuntimeReadiness,
      }),
      inject: [
        InMemorySourceProviderRegistry,
        SOCIAL_RESEARCH_RUNTIME_SETTINGS,
      ],
    },
    {
      provide: SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE,
      useFactory: (
        settings: SocialResearchRuntimeSettings,
        prismaClient: PrismaSocialResearchResultCacheClient | undefined,
      ): SocialResearchResultCachePort | undefined => {
        if (settings.resultCache.mode === 'disabled') {
          return undefined;
        }

        if (settings.resultCache.mode === 'ephemeral') {
          return new EphemeralSocialResearchResultCache({
            ttlMs: settings.resultCache.ttlMs,
            maxEntries: settings.resultCache.maxEntries,
          });
        }

        return new PrismaSocialResearchResultCache(
          requirePrismaSocialResearchClient(prismaClient),
          {
            clock: new SystemClock(),
            ttlMs: settings.resultCache.ttlMs,
            maxEntries: settings.resultCache.maxEntries,
          },
        );
      },
      inject: [
        SOCIAL_RESEARCH_RUNTIME_SETTINGS,
        SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT,
      ],
    },
    {
      provide: SocialResearchToolHandlers,
      useFactory: (
        gateway: SourceFetcherSocialResearchGateway,
        executionPolicy: DefaultSocialResearchExecutionPolicy,
        resultCache: SocialResearchResultCachePort | undefined,
        defaultPlannerOptions: SocialSearchPlannerOptions,
      ) =>
        new SocialResearchToolHandlers({
          gateway,
          executionPolicy,
          resultCache,
          defaultPlannerOptions,
        }),
      inject: [
        SourceFetcherSocialResearchGateway,
        DefaultSocialResearchExecutionPolicy,
        SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE,
        SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS,
      ],
    },
  ],
  exports: [
    SocialResearchToolHandlers,
    DefaultSocialResearchExecutionPolicy,
    SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE,
    SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT,
    SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS,
  ],
})
export class SocialResearchRuntimeModule {}

const requirePrismaSocialResearchClient = (
  client: PrismaSocialResearchResultCacheClient | undefined,
): PrismaSocialResearchResultCacheClient => {
  if (client === undefined) {
    throw new Error('Prisma social research cache client is not configured');
  }

  return client;
};
