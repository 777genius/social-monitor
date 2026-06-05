import { FakeSourceProvider } from './fake-source.provider';
import { InMemorySourceProviderRegistry } from './in-memory-source-provider.registry';
import { sourceReadinessProfiles } from './source-readiness-profiles';

describe('InMemorySourceProviderRegistry', () => {
  it('returns registered providers, capability profiles and future-source readiness profiles', async () => {
    const registry = new InMemorySourceProviderRegistry([new FakeSourceProvider()], sourceReadinessProfiles);

    await expect(registry.getProvider('fake-source')).resolves.toBeInstanceOf(FakeSourceProvider);
    await expect(registry.getProvider('hacker-news')).resolves.toBeNull();
    await expect(registry.listCapabilityProfiles()).resolves.toEqual([
      expect.objectContaining({
        providerKey: 'fake-source',
        productionSafe: true,
      }),
    ]);
    await expect(registry.getReadinessProfile('reddit')).resolves.toEqual(
      expect.objectContaining({
        providerKey: 'reddit',
        state: 'profiled',
        acquisitionMode: 'official_api_or_approved_vendor',
      }),
    );
    await expect(registry.listReadinessProfiles()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerKey: 'hacker-news', state: 'profiled' }),
        expect.objectContaining({ providerKey: 'x-twitter', state: 'provider_only' }),
        expect.objectContaining({ providerKey: 'telegram', state: 'manual_only' }),
      ]),
    );
  });
});
