import type { SourceCapabilityProfile, SourceCatalogPort } from '../../ports';

const fakeSourceProfile: SourceCapabilityProfile = {
  providerKey: 'fake-source',
  version: 1,
  productionSafe: true,
  supportsCursor: true,
};

export class FakeSourceCatalogAdapter implements SourceCatalogPort {
  async getCapability(providerKey: string): Promise<SourceCapabilityProfile | null> {
    return providerKey === fakeSourceProfile.providerKey ? fakeSourceProfile : null;
  }
}
