import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FakeSourceProvider } from './fake-source.provider';
import { InMemorySourceProviderRegistry } from './in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from './registry-source-fetcher.adapter';

describe('RegistrySourceFetcherAdapter', () => {
  it('resolves the requested provider and scans with queue source query metadata', async () => {
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([new FakeSourceProvider()], []),
    );

    const result = await fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'fake-source',
      sourceQuery: { mode: 'search', query: 'registry monitoring' },
      correlationId: 'correlation-registry-fetcher',
      cursor: 'cursor-before-registry-fetcher',
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      externalId: 'source-binding-registry-fetcher:fake-post-1',
      body: 'First deterministic item for registry monitoring',
    });
  });

  it('rejects unknown providers before scanning', async () => {
    const fetcher = new RegistrySourceFetcherAdapter(new InMemorySourceProviderRegistry([], []));

    await expect(fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'missing-source',
      sourceQuery: { mode: 'search', query: 'registry monitoring' },
      correlationId: 'correlation-registry-fetcher',
    })).rejects.toThrow('Source provider not registered: missing-source');
  });

  it('rejects invalid provider queries before scanning', async () => {
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([new FakeSourceProvider()], []),
    );

    await expect(fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'fake-source',
      sourceQuery: { mode: 'thread', query: 'registry monitoring' },
      correlationId: 'correlation-registry-fetcher',
    })).rejects.toThrow('Unsupported query mode: thread');
  });
});
