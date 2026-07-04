import type {
  SourceCapabilityProfile,
  SourceProviderRegistryPort,
  SourceQueryMode,
  SourceReadinessProfile,
} from '@social-monitor/ingestion/ports';

import type { SocialSourceCapabilityProfile } from '../../domain/value-objects/social-source-capability-profile';
import type { SocialSearchLaneOperation } from '../../domain/value-objects/social-search-plan';

export const socialSourceCapabilitiesFromRegistry = async (
  registry: SourceProviderRegistryPort,
): Promise<readonly SocialSourceCapabilityProfile[]> => {
  const [capabilities, readinessProfiles] = await Promise.all([
    registry.listCapabilityProfiles(),
    registry.listReadinessProfiles(),
  ]);
  const readinessByProvider = new Map(
    readinessProfiles.map((profile) => [profile.providerKey, profile]),
  );

  return capabilities.map((capability) =>
    socialSourceCapabilityFromIngestionProfile(
      capability,
      readinessByProvider.get(capability.providerKey),
    ),
  );
};

export const socialSourceCapabilityFromIngestionProfile = (
  capability: SourceCapabilityProfile,
  readiness?: SourceReadinessProfile,
): SocialSourceCapabilityProfile => ({
  sourceKey: capability.providerKey,
  displayName: capability.displayName,
  version: capability.version,
  productionSafe: capability.productionSafe,
  supportedOperations: socialOperationsForQueryModes(
    capability.supportedQueryModes,
  ),
  supportedContentUnits: capability.supportedContentUnits,
  cursorModel: capability.cursorModel,
  quotaModel: capability.quotaModel,
  readiness:
    readiness === undefined
      ? undefined
      : {
          state: readiness.state,
          runtimeReadiness: readiness.runtimeReadiness,
          liveBetaBlockers: readiness.liveBetaBlockers,
        },
  limitations: capability.limitations,
});

const socialOperationsForQueryModes = (
  queryModes: readonly SourceQueryMode[],
): readonly SocialSearchLaneOperation[] => {
  const operations = queryModes.flatMap((mode): readonly SocialSearchLaneOperation[] => {
    if (mode === 'thread') {
      return ['enrichment'];
    }
    if (mode === 'account_feed') {
      return ['account_feed'];
    }

    return [mode];
  });

  return [...new Set(operations)];
};
