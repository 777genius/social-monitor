import type { ProviderKey, SourceProviderPort } from './source-provider.port';
import type { SourceReadinessProfile } from './source-readiness-profile.port';

export interface SourceProviderRegistryPort {
  getProvider(providerKey: ProviderKey): Promise<SourceProviderPort | null>;
  listCapabilityProfiles(): Promise<readonly ReturnType<SourceProviderPort['capabilityProfile']>[]>;
  getReadinessProfile(providerKey: ProviderKey): Promise<SourceReadinessProfile | null>;
  listReadinessProfiles(): Promise<readonly SourceReadinessProfile[]>;
}
