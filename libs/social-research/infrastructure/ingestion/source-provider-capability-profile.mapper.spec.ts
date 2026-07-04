import type {
  SourceCapabilityProfile,
  SourceProviderRegistryPort,
  SourceReadinessProfile,
} from '@social-monitor/ingestion/ports';

import {
  socialSourceCapabilitiesFromRegistry,
  socialSourceCapabilityFromIngestionProfile,
} from './source-provider-capability-profile.mapper';

describe('source provider capability profile mapper', () => {
  it('projects ingestion capability and readiness into SDK-neutral capabilities', () => {
    expect(
      socialSourceCapabilityFromIngestionProfile(
        {
          providerKey: 'reddit',
          displayName: 'Reddit',
          version: 2,
          productionSafe: true,
          supportedContentUnits: ['post', 'comment', 'link'],
          supportedQueryModes: ['search', 'listing', 'thread'],
          cursorModel: 'opaque',
          stableIdentity: ['providerId', 'canonicalUrl'],
          quotaModel: 'per_app',
          limitations: ['OAuth only.'],
        },
        readinessProfile(),
      ),
    ).toEqual({
      sourceKey: 'reddit',
      displayName: 'Reddit',
      version: 2,
      productionSafe: true,
      supportedOperations: ['search', 'listing', 'enrichment'],
      supportedContentUnits: ['post', 'comment', 'link'],
      cursorModel: 'opaque',
      quotaModel: 'per_app',
      readiness: {
        state: 'enabled_beta',
        runtimeReadiness: 'fixture_ready',
        liveBetaBlockers: ['Live evidence required.'],
      },
      limitations: ['OAuth only.'],
    });
  });

  it('loads projected capabilities from a source provider registry', async () => {
    const registry: SourceProviderRegistryPort = {
      async getProvider() {
        return null;
      },
      async getReadinessProfile() {
        return null;
      },
      async listCapabilityProfiles() {
        return [
          capabilityProfile({
            providerKey: 'rss',
            supportedQueryModes: ['url'],
          }),
          capabilityProfile({
            providerKey: 'x-twitter',
            supportedQueryModes: ['search', 'account_feed'],
            quotaModel: 'per_credential',
          }),
        ];
      },
      async listReadinessProfiles() {
        return [readinessProfile({ providerKey: 'x-twitter' })];
      },
    };

    await expect(socialSourceCapabilitiesFromRegistry(registry)).resolves.toEqual([
      expect.objectContaining({
        sourceKey: 'rss',
        supportedOperations: ['url'],
      }),
      expect.objectContaining({
        sourceKey: 'x-twitter',
        supportedOperations: ['search', 'account_feed'],
        quotaModel: 'per_credential',
        readiness: expect.objectContaining({
          state: 'enabled_beta',
        }),
      }),
    ]);
  });
});

const capabilityProfile = (
  overrides: Partial<SourceCapabilityProfile> = {},
): SourceCapabilityProfile => ({
  providerKey: 'reddit',
  displayName: 'Reddit',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['post'],
  supportedQueryModes: ['search'],
  cursorModel: 'opaque',
  stableIdentity: ['providerId'],
  quotaModel: 'per_app',
  limitations: [],
  ...overrides,
});

const readinessProfile = (
  overrides: Partial<SourceReadinessProfile> = {},
): SourceReadinessProfile => ({
  providerKey: 'reddit',
  state: 'enabled_beta',
  runtimeReadiness: 'fixture_ready',
  liveBetaBlockers: ['Live evidence required.'],
  liveEvidenceRequirements: [],
  freshnessGuard: {
    maxStalenessSeconds: 900,
    minimumScanIntervalSeconds: 300,
    skipRecentlyScanned: true,
    scanHistoryRequired: true,
    cursorResumeRequired: true,
    rateLimitBackoffRequired: true,
    staleReadModelState: 'stale',
    providerFailureHealthState: 'down',
    signals: ['test'],
  },
  acquisitionMode: 'official_api',
  approvalOwner: 'engineering',
  termsNotes: 'test',
  credentialOwnership: 'none',
  quotaModel: 'per_app',
  retentionNotes: 'test',
  cursorModel: 'opaque',
  identityStrategy: ['providerId'],
  supportedContentUnits: ['post'],
  unsupportedContentUnits: [],
  estimatedCostPerScan: 'low',
  betaEnablementCriteria: ['test'],
  rollbackPlan: 'disable provider',
  ...overrides,
});
