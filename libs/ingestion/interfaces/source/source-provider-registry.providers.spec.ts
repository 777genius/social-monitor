import { Test } from '@nestjs/testing';
import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CREDENTIAL_RESOLVER,
} from '@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens';

import { CircuitBreakerSourceFetcherAdapter } from '../../adapters/source/circuit-breaker-source-fetcher.adapter';
import { GitHubRepoRadarSourceProvider } from '../../adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { InMemorySourceProviderRegistry } from '../../adapters/source/in-memory-source-provider.registry';
import { MonitoringSourceConfigReaderAdapter } from '../../adapters/source/monitoring-source-config-reader.adapter';
import {
  INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS,
  resolveSourceProviderRuntimeSettings,
} from './source-provider-registry-provider-tokens';
import { sourceProviderRegistryProviders } from './source-provider-registry.providers';

describe('sourceProviderRegistryProviders', () => {
  it('wires reusable source provider runtime outside the ingestion worker app', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...sourceProviderRegistryProviders,
        {
          provide: INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS,
          useValue: resolveSourceProviderRuntimeSettings({
            SOCIAL_MONITOR_RUNTIME_PROFILE: 'deterministic-test',
          }),
        },
        {
          provide: MONITORING_SOURCE_BINDING_REPOSITORY,
          useValue: {
            findById: async () => null,
          },
        },
        {
          provide: MONITORING_CONFIG_PROTECTOR,
          useValue: {
            unprotect: async (config: unknown) => config,
          },
        },
        {
          provide: MONITORING_SOURCE_CREDENTIAL_RESOLVER,
          useValue: {
            resolve: async () => {
              throw new Error('should not resolve credentials during wiring');
            },
          },
        },
      ],
    }).compile();

    try {
      expect(moduleRef.get(InMemorySourceProviderRegistry)).toBeInstanceOf(
        InMemorySourceProviderRegistry,
      );
      expect(moduleRef.get(CircuitBreakerSourceFetcherAdapter)).toBeInstanceOf(
        CircuitBreakerSourceFetcherAdapter,
      );
      expect(moduleRef.get(MonitoringSourceConfigReaderAdapter)).toBeInstanceOf(
        MonitoringSourceConfigReaderAdapter,
      );
      expect(moduleRef.get(GitHubRepoRadarSourceProvider)).toBeInstanceOf(
        GitHubRepoRadarSourceProvider,
      );
    } finally {
      await moduleRef.close();
    }
  });
});
