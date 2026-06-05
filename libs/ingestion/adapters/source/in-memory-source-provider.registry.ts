import type {
  ProviderKey,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderRegistryPort,
  SourceReadinessProfile,
} from '../../ports';

export class InMemorySourceProviderRegistry implements SourceProviderRegistryPort {
  private readonly providers = new Map<ProviderKey, SourceProviderPort>();
  private readonly readinessProfiles = new Map<ProviderKey, SourceReadinessProfile>();

  constructor(
    providers: readonly SourceProviderPort[],
    readinessProfiles: readonly SourceReadinessProfile[],
  ) {
    for (const provider of providers) {
      this.providers.set(provider.key(), provider);
    }

    for (const profile of readinessProfiles) {
      this.readinessProfiles.set(profile.providerKey, profile);
    }
  }

  async getProvider(providerKey: ProviderKey): Promise<SourceProviderPort | null> {
    return this.providers.get(providerKey) ?? null;
  }

  async listCapabilityProfiles(): Promise<readonly SourceCapabilityProfile[]> {
    return [...this.providers.values()].map((provider) => provider.capabilityProfile());
  }

  async getReadinessProfile(providerKey: ProviderKey): Promise<SourceReadinessProfile | null> {
    return this.readinessProfiles.get(providerKey) ?? null;
  }

  async listReadinessProfiles(): Promise<readonly SourceReadinessProfile[]> {
    return [...this.readinessProfiles.values()];
  }
}
