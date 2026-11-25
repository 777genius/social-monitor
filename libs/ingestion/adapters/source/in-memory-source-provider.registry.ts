import type {
  ProviderKey,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderRegistryPort,
  SourceReadinessProfile,
} from '../../ports';

export class InMemorySourceProviderRegistry implements SourceProviderRegistryPort {
  private readonly providers = new Map<ProviderKey, SourceProviderPort>();
  private readonly providerAliases = new Map<ProviderKey, ProviderKey>();
  private readonly readinessProfiles = new Map<ProviderKey, SourceReadinessProfile>();
  private readonly capabilityProfiles = new Map<ProviderKey, SourceCapabilityProfile>();

  constructor(
    providers: readonly SourceProviderPort[],
    readinessProfiles: readonly SourceReadinessProfile[],
    aliases: readonly SourceProviderAlias[] = [],
    capabilityProfiles: readonly SourceCapabilityProfile[] = [],
  ) {
    for (const provider of providers) {
      this.providers.set(provider.key(), provider);
    }

    for (const alias of aliases) {
      this.providerAliases.set(alias.providerKey, alias.canonicalProviderKey);
    }

    for (const profile of readinessProfiles) {
      this.readinessProfiles.set(profile.providerKey, profile);
    }

    for (const profile of capabilityProfiles) {
      this.capabilityProfiles.set(profile.providerKey, profile);
    }
  }

  async getProvider(providerKey: ProviderKey): Promise<SourceProviderPort | null> {
    return this.providers.get(this.canonicalProviderKey(providerKey)) ?? null;
  }

  async listCapabilityProfiles(): Promise<readonly SourceCapabilityProfile[]> {
    const profiles = new Map(this.capabilityProfiles);
    for (const provider of this.providers.values()) {
      profiles.set(provider.key(), provider.capabilityProfile());
    }

    return [...profiles.values()];
  }

  async getReadinessProfile(providerKey: ProviderKey): Promise<SourceReadinessProfile | null> {
    return this.readinessProfiles.get(this.canonicalProviderKey(providerKey)) ?? null;
  }

  async listReadinessProfiles(): Promise<readonly SourceReadinessProfile[]> {
    return [...this.readinessProfiles.values()];
  }

  private canonicalProviderKey(providerKey: ProviderKey): ProviderKey {
    return this.providerAliases.get(providerKey) ?? providerKey;
  }
}

export type SourceProviderAlias = {
  readonly providerKey: ProviderKey;
  readonly canonicalProviderKey: ProviderKey;
};
