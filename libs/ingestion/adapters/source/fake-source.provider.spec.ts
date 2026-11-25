import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FakeSourceProvider } from './fake-source.provider';
import { certifySourceProvider } from './testing/source-provider-certification';

describe('FakeSourceProvider certification', () => {
  certifySourceProvider({
    providerFactory: () => new FakeSourceProvider(),
    validQuery: { mode: 'search', query: 'monitoring' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'fake-source',
  });

  it('declares required capability profile fields', () => {
    const profile = new FakeSourceProvider().capabilityProfile();

    expect(profile).toMatchObject({
      providerKey: 'fake-source',
      displayName: 'Fake Source',
      version: 1,
      productionSafe: true,
      cursorModel: 'opaque',
      quotaModel: 'none',
    });
    expect(profile.supportedContentUnits).toEqual(expect.arrayContaining(['post', 'link']));
    expect(profile.supportedQueryModes).toEqual(expect.arrayContaining(['search', 'listing']));
    expect(profile.stableIdentity).toEqual(expect.arrayContaining(['externalId', 'canonicalUrl']));
    expect(profile.limitations).not.toHaveLength(0);
  });

  it('rejects unsupported query modes before scanning', () => {
    const provider = new FakeSourceProvider();

    expect(provider.validateBinding({ mode: 'thread', query: 'item' })).toEqual({
      ok: false,
      reason: 'Unsupported query mode: thread',
    });
  });

  it('returns normalized source items with stable identities', async () => {
    const provider = new FakeSourceProvider();
    const context = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'source-binding-1',
      scanJobId: 'scan-job-1',
      correlationId: 'correlation-1',
    };
    const query = { mode: 'search' as const, query: 'monitoring' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      externalId: 'source-binding-1:fake-post-1',
      canonicalUrl: 'https://example.test/source/source-binding-1/fake-post-1',
      title: 'Fake source post 1',
      body: 'First deterministic item for monitoring',
      authorHandle: 'fake-author',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(result.nextCursor).toBe('fake-cursor-next');
    expect(result.warnings).toEqual([]);
  });
});
