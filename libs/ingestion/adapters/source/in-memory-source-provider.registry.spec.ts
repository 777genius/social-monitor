import { FakeSourceProvider } from './fake-source.provider';
import {
  GITHUB_ISSUES_PROVIDER_KEY,
  LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
} from './github/github-source.provider';
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
        state: 'enabled_beta',
        acquisitionMode: 'official_oauth_api',
      }),
    );
    await expect(registry.listReadinessProfiles()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerKey: 'hacker-news', state: 'enabled_beta' }),
        expect.objectContaining({ providerKey: GITHUB_ISSUES_PROVIDER_KEY, state: 'enabled_beta' }),
        expect.objectContaining({ providerKey: 'x-twitter', state: 'provider_only' }),
        expect.objectContaining({ providerKey: 'telegram', state: 'manual_only' }),
      ]),
    );
  });

  it('resolves legacy provider aliases to the canonical provider and readiness profile', async () => {
    const provider = new FakeSourceProvider();
    const registry = new InMemorySourceProviderRegistry(
      [provider],
      sourceReadinessProfiles,
      [{ providerKey: LEGACY_GITHUB_ISSUES_PROVIDER_KEY, canonicalProviderKey: 'fake-source' }],
    );

    await expect(registry.getProvider(LEGACY_GITHUB_ISSUES_PROVIDER_KEY)).resolves.toBe(provider);
    await expect(registry.getReadinessProfile(LEGACY_GITHUB_ISSUES_PROVIDER_KEY)).resolves.toEqual(
      expect.objectContaining({ providerKey: 'fake-source' }),
    );
  });
});
