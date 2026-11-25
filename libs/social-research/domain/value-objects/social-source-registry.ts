import type { SocialSourceKey } from './social-search-intent';
import {
  builtInSocialSourceCapabilityProfiles,
  type SocialSourceCapabilityProfile,
  type SocialSourceReadinessState,
  type SocialSourceRuntimeReadinessState,
} from './social-source-capability-profile';

export const socialSourceAcquisitionModes = [
  'official_api',
  'open_public_api',
  'public_feed',
  'public_page_with_policy',
  'official_protocol',
  'private_collector',
  'research_bundle',
  'custom_extension',
] as const;

export type SocialSourceAcquisitionMode =
  (typeof socialSourceAcquisitionModes)[number];

export const socialSourceCredentialPolicies = [
  'none',
  'app',
  'per_tenant',
  'app_with_tenant_override',
  'research_accounts',
  'source_binding',
] as const;

export type SocialSourceCredentialPolicy =
  (typeof socialSourceCredentialPolicies)[number];

export const socialSourceRuntimeAdapterPolicies = [
  'not_required',
  'product_adapter_required',
  'private_service_required',
  'not_wired',
] as const;

export type SocialSourceRuntimeAdapterPolicy =
  (typeof socialSourceRuntimeAdapterPolicies)[number];

export const socialSourceCertificationLevels = [
  'profile_only',
  'fixture_certified',
  'manual_review_required',
  'provider_runtime_gated',
  'live_beta_ready',
  'rejected',
] as const;

export type SocialSourceCertificationLevel =
  (typeof socialSourceCertificationLevels)[number];

export const socialSourceRiskLevels = ['low', 'medium', 'high'] as const;

export type SocialSourceRiskLevel = (typeof socialSourceRiskLevels)[number];

export type SocialSourceRegistryMetadata = {
  readonly acquisitionMode: SocialSourceAcquisitionMode;
  readonly credentialPolicy: SocialSourceCredentialPolicy;
  readonly runtimeAdapterPolicy: SocialSourceRuntimeAdapterPolicy;
  readonly riskLevel: SocialSourceRiskLevel;
  readonly approvalOwner: 'engineering' | 'product_and_legal' | 'custom_owner';
  readonly termsRequired: boolean;
  readonly liveEvidenceRequired: boolean;
  readonly rollbackRequired: boolean;
};

export type SocialSourceRegistryEntry = {
  readonly sourceKey: SocialSourceKey;
  readonly displayName: string;
  readonly capabilityProfile: SocialSourceCapabilityProfile;
  readonly certification: {
    readonly level: SocialSourceCertificationLevel;
    readonly readinessState: SocialSourceReadinessState;
    readonly runtimeReadiness: SocialSourceRuntimeReadinessState;
    readonly productionSafe: boolean;
    readonly acquisitionMode: SocialSourceAcquisitionMode;
    readonly credentialPolicy: SocialSourceCredentialPolicy;
    readonly runtimeAdapterPolicy: SocialSourceRuntimeAdapterPolicy;
    readonly riskLevel: SocialSourceRiskLevel;
    readonly approvalOwner: SocialSourceRegistryMetadata['approvalOwner'];
    readonly termsRequired: boolean;
    readonly liveEvidenceRequired: boolean;
    readonly rollbackRequired: boolean;
    readonly liveBetaBlocked: boolean;
    readonly liveBetaBlockers: readonly string[];
  };
};

const builtInRegistryMetadataBySource: Readonly<
  Record<string, SocialSourceRegistryMetadata>
> = {
  reddit: {
    acquisitionMode: 'official_api',
    credentialPolicy: 'app_with_tenant_override',
    runtimeAdapterPolicy: 'product_adapter_required',
    riskLevel: 'medium',
    approvalOwner: 'product_and_legal',
    termsRequired: true,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  },
  'x-twitter': {
    acquisitionMode: 'private_collector',
    credentialPolicy: 'research_accounts',
    runtimeAdapterPolicy: 'private_service_required',
    riskLevel: 'high',
    approvalOwner: 'product_and_legal',
    termsRequired: true,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  },
  youtube: {
    acquisitionMode: 'research_bundle',
    credentialPolicy: 'none',
    runtimeAdapterPolicy: 'not_wired',
    riskLevel: 'high',
    approvalOwner: 'product_and_legal',
    termsRequired: true,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  },
  github: {
    acquisitionMode: 'official_api',
    credentialPolicy: 'app',
    runtimeAdapterPolicy: 'product_adapter_required',
    riskLevel: 'medium',
    approvalOwner: 'engineering',
    termsRequired: true,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  },
  'hacker-news': {
    acquisitionMode: 'open_public_api',
    credentialPolicy: 'none',
    runtimeAdapterPolicy: 'product_adapter_required',
    riskLevel: 'low',
    approvalOwner: 'engineering',
    termsRequired: false,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  },
  rss: {
    acquisitionMode: 'public_feed',
    credentialPolicy: 'source_binding',
    runtimeAdapterPolicy: 'product_adapter_required',
    riskLevel: 'medium',
    approvalOwner: 'engineering',
    termsRequired: true,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  },
  bluesky: {
    acquisitionMode: 'official_protocol',
    credentialPolicy: 'app',
    runtimeAdapterPolicy: 'not_wired',
    riskLevel: 'medium',
    approvalOwner: 'engineering',
    termsRequired: true,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  },
};

export const builtInSocialSourceRegistryEntries: readonly SocialSourceRegistryEntry[] =
  builtInSocialSourceCapabilityProfiles.map((profile) =>
    createSocialSourceRegistryEntry(
      profile,
      metadataForBuiltInSource(profile.sourceKey),
    ),
  );

export function createSocialSourceRegistryEntry(
  profile: SocialSourceCapabilityProfile,
  metadata: SocialSourceRegistryMetadata,
): SocialSourceRegistryEntry {
  const readiness = profile.readiness ?? {
    state: 'profiled',
    runtimeReadiness: 'deferred',
    liveBetaBlockers: ['Source readiness profile is missing.'],
  };
  const liveBetaBlockers = readiness.liveBetaBlockers ?? [];

  return {
    sourceKey: profile.sourceKey,
    displayName: profile.displayName ?? profile.sourceKey,
    capabilityProfile: profile,
    certification: {
      level: certificationLevelFor(readiness),
      readinessState: readiness.state,
      runtimeReadiness: readiness.runtimeReadiness,
      productionSafe: profile.productionSafe === true,
      acquisitionMode: metadata.acquisitionMode,
      credentialPolicy: metadata.credentialPolicy,
      runtimeAdapterPolicy: metadata.runtimeAdapterPolicy,
      riskLevel: metadata.riskLevel,
      approvalOwner: metadata.approvalOwner,
      termsRequired: metadata.termsRequired,
      liveEvidenceRequired: metadata.liveEvidenceRequired,
      rollbackRequired: metadata.rollbackRequired,
      liveBetaBlocked: liveBetaBlockers.length > 0,
      liveBetaBlockers,
    },
  };
}

export const buildSocialSourceRegistry = (
  entries: readonly SocialSourceRegistryEntry[] = builtInSocialSourceRegistryEntries,
): readonly SocialSourceRegistryEntry[] =>
  [...sourceRegistryEntryBySource(entries).values()].sort((left, right) =>
    left.sourceKey.localeCompare(right.sourceKey),
  );

export const sourceRegistryEntryBySource = (
  entries: readonly SocialSourceRegistryEntry[],
): ReadonlyMap<SocialSourceKey, SocialSourceRegistryEntry> =>
  new Map(entries.map((entry) => [entry.sourceKey, entry]));

function metadataForBuiltInSource(
  sourceKey: SocialSourceKey,
): SocialSourceRegistryMetadata {
  const metadata = builtInRegistryMetadataBySource[sourceKey];
  if (metadata !== undefined) {
    return metadata;
  }

  return {
    acquisitionMode: 'custom_extension',
    credentialPolicy: 'per_tenant',
    runtimeAdapterPolicy: 'not_wired',
    riskLevel: 'medium',
    approvalOwner: 'custom_owner',
    termsRequired: true,
    liveEvidenceRequired: true,
    rollbackRequired: true,
  };
}

function certificationLevelFor(readiness: {
  readonly state: SocialSourceReadinessState;
  readonly runtimeReadiness: SocialSourceRuntimeReadinessState;
}): SocialSourceCertificationLevel {
  if (readiness.state === 'rejected') {
    return 'rejected';
  }
  if (readiness.runtimeReadiness === 'live_beta_ready') {
    return 'live_beta_ready';
  }
  if (readiness.state === 'enabled_beta') {
    return 'fixture_certified';
  }
  if (readiness.state === 'provider_only') {
    return 'provider_runtime_gated';
  }
  if (readiness.state === 'manual_only') {
    return 'manual_review_required';
  }

  return 'profile_only';
}
