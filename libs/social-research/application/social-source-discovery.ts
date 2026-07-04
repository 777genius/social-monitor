import type { SocialSourceKey } from '../domain/value-objects/social-search-intent';
import {
  buildSocialSourceRegistry,
  sourceRegistryEntryBySource,
  type SocialSourceRegistryEntry,
} from '../domain/value-objects/social-source-registry';

export type SocialSourceListInput = {
  readonly sourceKeys?: readonly SocialSourceKey[];
  readonly includeProfileOnly?: boolean;
  readonly includeProviderRuntimeGated?: boolean;
  readonly includeRejected?: boolean;
};

export type SocialSourceProfileInput = {
  readonly sourceKey: SocialSourceKey;
};

export type SocialSourceReadinessExplanation = {
  readonly source: SocialSourceRegistryEntry;
  readonly canPlan: boolean;
  readonly canExecuteWithDefaultPolicy: boolean;
  readonly summary: string;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
};

export const listSocialSources = (
  entries: readonly SocialSourceRegistryEntry[] | undefined,
  input: SocialSourceListInput = {},
): readonly SocialSourceRegistryEntry[] => {
  const requestedSources = new Set(input.sourceKeys ?? []);

  return buildSocialSourceRegistry(entries).filter((entry) => {
    if (
      requestedSources.size > 0 &&
      !requestedSources.has(entry.sourceKey)
    ) {
      return false;
    }
    if (
      input.includeRejected !== true &&
      entry.certification.level === 'rejected'
    ) {
      return false;
    }
    if (
      input.includeProfileOnly === false &&
      entry.certification.level === 'profile_only'
    ) {
      return false;
    }
    if (
      input.includeProviderRuntimeGated === false &&
      entry.certification.level === 'provider_runtime_gated'
    ) {
      return false;
    }

    return true;
  });
};

export const findSocialSourceProfile = (
  entries: readonly SocialSourceRegistryEntry[] | undefined,
  input: SocialSourceProfileInput | SocialSourceKey,
): SocialSourceRegistryEntry | undefined =>
  sourceRegistryEntryBySource(buildSocialSourceRegistry(entries)).get(
    sourceKeyFromProfileInput(input),
  );

export const explainSocialSourceReadiness = (
  source: SocialSourceRegistryEntry,
): SocialSourceReadinessExplanation => {
  const canPlan =
    source.certification.level !== 'rejected' &&
    source.capabilityProfile.supportedOperations.length > 0;
  const canExecuteWithDefaultPolicy =
    canPlan &&
    ['fixture_ready', 'live_beta_ready'].includes(
      source.certification.runtimeReadiness,
    ) &&
    source.certification.runtimeAdapterPolicy !== 'not_wired';
  const reasons = readinessReasons({
    source,
    canPlan,
    canExecuteWithDefaultPolicy,
  });
  const warnings = readinessWarnings(source);

  return {
    source,
    canPlan,
    canExecuteWithDefaultPolicy,
    summary: `${source.displayName} is ${source.certification.level} with runtimeReadiness=${source.certification.runtimeReadiness}.`,
    reasons,
    warnings,
  };
};

const sourceKeyFromProfileInput = (
  input: SocialSourceProfileInput | SocialSourceKey,
): SocialSourceKey => (typeof input === 'string' ? input : input.sourceKey);

const readinessReasons = (params: {
  readonly source: SocialSourceRegistryEntry;
  readonly canPlan: boolean;
  readonly canExecuteWithDefaultPolicy: boolean;
}): readonly string[] => [
  params.canPlan
    ? 'Capability profile can produce provider-neutral search lanes.'
    : 'Capability profile cannot produce search lanes.',
  params.canExecuteWithDefaultPolicy
    ? 'Default execution readiness allows this source when a runtime binding is configured.'
    : 'Default execution readiness will require explicit approval, runtime wiring or a custom execution policy.',
  `${params.source.certification.acquisitionMode} acquisition with ${params.source.certification.credentialPolicy} credentials.`,
];

const readinessWarnings = (
  source: SocialSourceRegistryEntry,
): readonly string[] => [
  ...(source.certification.runtimeAdapterPolicy === 'not_wired'
    ? ['Runtime adapter is not wired for product execution.']
    : []),
  ...(source.certification.level === 'provider_runtime_gated'
    ? ['Provider runtime is gated and must not be enabled implicitly.']
    : []),
  ...source.certification.liveBetaBlockers.map(
    (blocker) => `Live beta blocker: ${blocker}`,
  ),
];
