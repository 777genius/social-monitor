import { MonitoringSourceConfigReaderAdapter } from '../apps/ingestion-worker/src/adapters/source/monitoring-source-config-reader.adapter';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { FixtureRedditClient } from '../libs/ingestion/adapters/source/reddit/fixture-reddit-client';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { AesGcmSourceBindingConfigProtector } from '../libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { SourceBinding } from '../libs/monitoring/domain';
import { sourceBindingScanQuery } from '../libs/monitoring/features/shared/source-binding-scan-query';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-reddit-smoke');
  const workspace = workspaceId('workspace-reddit-smoke');
  const sourceBindings = new InMemorySourceBindingRepository();
  const protector = new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 1), 'reddit-smoke-key');
  const protectedConfig = await protector.protect({
    mode: 'listing',
    subreddit: 'observability',
    listing: 'hot',
    accessToken: 'fixture-reddit-token',
    userAgent: 'social-monitor-reddit-smoke/0.1',
  });
  const binding = SourceBinding.create({
    id: 'source-binding-reddit-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-reddit-smoke',
    providerKey: 'reddit',
    capabilityProfileVersion: 1,
    config: protectedConfig,
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
  });

  await sourceBindings.save(binding);

  const fetcher = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([new RedditSourceProvider(new FixtureRedditClient())], []),
    new MonitoringSourceConfigReaderAdapter(sourceBindings, protector),
  );
  const result = await fetcher.fetch({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-reddit-smoke',
    scanJobId: 'scan-job-reddit-smoke',
    providerKey: 'reddit',
    sourceQuery: sourceBindingScanQuery(binding.toSnapshot()),
    correlationId: 'reddit-smoke',
  });

  assert(JSON.stringify(binding.toSnapshot().config).includes('fixture-reddit-token') === false, 'token must be encrypted');
  assert(result.items.length === 2, `expected two Reddit fixture items, got ${result.items.length}`);
  assert(result.items[0]?.externalId === 'reddit:t3_fixturepost1', 'first Reddit external id mismatch');
  assert(result.items[0]?.canonicalUrl.startsWith('https://www.reddit.com/r/observability/'), 'canonical URL mismatch');
  assert(result.nextCursor === 't3_fixturepost2', `expected Reddit cursor, got ${result.nextCursor}`);

  console.log('Reddit ingestion smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
