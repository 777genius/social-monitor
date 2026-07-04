import {
  buildSocialSourceRegistry,
  builtInSocialSourceCapabilityProfiles,
  createSocialSourceRegistryEntry,
  sourceRegistryEntryBySource,
  type SocialSourceCapabilityProfile,
} from '@social-monitor/social-research';

describe('social source registry', () => {
  it('covers every built-in source capability profile with certification metadata', () => {
    const registry = buildSocialSourceRegistry();

    expect(registry.map((entry) => entry.sourceKey).sort()).toEqual(
      builtInSocialSourceCapabilityProfiles
        .map((profile) => profile.sourceKey)
        .sort(),
    );
    expect(
      registry.every(
        (entry) =>
          entry.capabilityProfile.sourceKey === entry.sourceKey &&
          entry.certification.readinessState ===
            entry.capabilityProfile.readiness?.state &&
          entry.certification.runtimeReadiness ===
            entry.capabilityProfile.readiness?.runtimeReadiness,
      ),
    ).toBe(true);
  });

  it('keeps risky provider-only sources explicit and gated', () => {
    const bySource = sourceRegistryEntryBySource(buildSocialSourceRegistry());

    expect(bySource.get('x-twitter')).toMatchObject({
      sourceKey: 'x-twitter',
      certification: {
        level: 'provider_runtime_gated',
        acquisitionMode: 'private_collector',
        credentialPolicy: 'research_accounts',
        runtimeAdapterPolicy: 'private_service_required',
        riskLevel: 'high',
        liveBetaBlocked: true,
      },
    });
  });

  it('keeps official API sources separate from live beta readiness claims', () => {
    const bySource = sourceRegistryEntryBySource(buildSocialSourceRegistry());

    expect(bySource.get('reddit')).toMatchObject({
      sourceKey: 'reddit',
      certification: {
        level: 'fixture_certified',
        acquisitionMode: 'official_api',
        credentialPolicy: 'app_with_tenant_override',
        runtimeReadiness: 'fixture_ready',
        liveEvidenceRequired: true,
        liveBetaBlocked: true,
      },
    });
  });

  it('allows custom sources to extend the registry without changing built-ins', () => {
    const profile: SocialSourceCapabilityProfile = {
      sourceKey: 'mastodon',
      displayName: 'Mastodon',
      version: 1,
      supportedOperations: ['search', 'mention_search'],
      readiness: {
        state: 'profiled',
        runtimeReadiness: 'deferred',
      },
    };
    const entry = createSocialSourceRegistryEntry(profile, {
      acquisitionMode: 'custom_extension',
      credentialPolicy: 'per_tenant',
      runtimeAdapterPolicy: 'not_wired',
      riskLevel: 'medium',
      approvalOwner: 'custom_owner',
      termsRequired: true,
      liveEvidenceRequired: true,
      rollbackRequired: true,
    });

    expect(entry).toMatchObject({
      sourceKey: 'mastodon',
      displayName: 'Mastodon',
      certification: {
        level: 'profile_only',
        runtimeReadiness: 'deferred',
        acquisitionMode: 'custom_extension',
      },
    });
  });
});
