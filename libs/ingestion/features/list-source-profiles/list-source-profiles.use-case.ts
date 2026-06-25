import { ok, type Result } from '@social-monitor/shared-kernel';

import type { SourceProviderRegistryPort } from '../../ports';
import type { ListSourceProfilesResult } from './list-source-profiles.result';

export class ListSourceProfilesUseCase {
  constructor(private readonly registry: SourceProviderRegistryPort) {}

  async execute(): Promise<Result<ListSourceProfilesResult, Error>> {
    const [capabilities, readinessProfiles] = await Promise.all([
      this.registry.listCapabilityProfiles(),
      this.registry.listReadinessProfiles(),
    ]);
    const capabilitiesByProvider = new Map(capabilities.map((capability) => [capability.providerKey, capability]));

    return ok({
      sources: readinessProfiles
        .map((profile) => {
          const capability = capabilitiesByProvider.get(profile.providerKey);

          return {
            providerKey: profile.providerKey,
            displayName: capability?.displayName,
            capabilityVersion: capability?.version,
            productionSafe: capability?.productionSafe ?? false,
            readinessState: profile.state,
            runtimeReadiness: profile.runtimeReadiness,
            liveBetaBlockers: profile.liveBetaBlockers,
            freshnessGuard: profile.freshnessGuard,
            acquisitionMode: profile.acquisitionMode,
            supportedContentUnits: profile.supportedContentUnits,
            supportedQueryModes: capability?.supportedQueryModes ?? [],
            cursorModel: profile.cursorModel,
            quotaModel: profile.quotaModel,
            limitations: capability?.limitations ?? [profile.termsNotes],
          };
        })
        .sort((left, right) => left.providerKey.localeCompare(right.providerKey)),
    });
  }
}
