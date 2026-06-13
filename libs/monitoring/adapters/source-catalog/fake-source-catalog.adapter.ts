import type { SourceCapabilityProfile, SourceCatalogPort } from '../../ports';

const fakeSourceProfile: SourceCapabilityProfile = {
  providerKey: 'fake-source',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const hackerNewsProfile: SourceCapabilityProfile = {
  providerKey: 'hacker-news',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const rssProfile: SourceCapabilityProfile = {
  providerKey: 'rss',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

const sourceProfiles = new Map([
  [fakeSourceProfile.providerKey, fakeSourceProfile],
  [hackerNewsProfile.providerKey, hackerNewsProfile],
  [rssProfile.providerKey, rssProfile],
]);

export class FakeSourceCatalogAdapter implements SourceCatalogPort {
  async getCapability(providerKey: string): Promise<SourceCapabilityProfile | null> {
    return sourceProfiles.get(providerKey) ?? null;
  }
}
