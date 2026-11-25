import { ok, type Result } from '@social-monitor/shared-kernel';

import type {
  SourceCapabilityProfile,
  SourceProviderRegistryPort,
  SourceReadinessProfile,
} from '../../ports';
import type {
  ListSourceProfilesResult,
  SourceProfileHealthExplanation,
} from './list-source-profiles.result';

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
            health: buildSourceProfileHealth(profile, capability),
            readinessState: profile.state,
            runtimeReadiness: profile.runtimeReadiness,
            liveBetaBlockers: profile.liveBetaBlockers,
            liveEvidenceRequirements: profile.liveEvidenceRequirements,
            freshnessGuard: profile.freshnessGuard,
            acquisitionMode: profile.acquisitionMode,
            supportedContentUnits: profile.supportedContentUnits,
            unsupportedContentUnits: profile.unsupportedContentUnits,
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

const buildSourceProfileHealth = (
  profile: SourceReadinessProfile,
  capability: SourceCapabilityProfile | undefined,
): SourceProfileHealthExplanation => {
  const providerName = capability?.displayName ?? displayNameFromProviderKey(profile.providerKey);

  if ((capability?.productionSafe ?? false) !== true) {
    return {
      state: 'unsupported_scope',
      reasonCode: 'source_not_production_safe',
      message: `${providerName} source is not production safe.`,
      signals: ['not_production_safe', profile.state, profile.runtimeReadiness],
    };
  }

  if (profile.runtimeReadiness === 'deferred') {
    return {
      state: 'unsupported_scope',
      reasonCode: 'runtime_deferred',
      message: `${providerName} source runtime disabled.`,
      signals: ['runtime_deferred', profile.state],
    };
  }

  if (!readinessStateCanCollect(profile.state)) {
    return {
      state: 'unsupported_scope',
      reasonCode: 'readiness_not_collectable',
      message: `${providerName} source scope not enabled for automated collection.`,
      signals: [profile.state, profile.runtimeReadiness],
    };
  }

  if (profile.liveBetaBlockers.length > 0) {
    return {
      state: 'degraded',
      reasonCode: 'live_beta_evidence_missing',
      message: `${providerName} source fixture-certified; live beta evidence still missing.`,
      signals: ['live_beta_evidence_missing', profile.runtimeReadiness],
    };
  }

  return {
    state: 'healthy',
    reasonCode: 'source_ready',
    message: `${providerName} source ready.`,
    signals: ['source_ready', profile.runtimeReadiness],
  };
};

const readinessStateCanCollect = (state: SourceReadinessProfile['state']): boolean =>
  state === 'enabled_beta' || state === 'certification_ready';

const displayNameFromProviderKey = (providerKey: string): string =>
  providerKey
    .split(/[-_\s]+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ') || 'Source';
