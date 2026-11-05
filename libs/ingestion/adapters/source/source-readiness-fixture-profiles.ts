import type { SourceReadinessProfile } from '../../ports';

export const sourceReadinessFixtureProfiles: readonly SourceReadinessProfile[] = [
  {
    providerKey: 'fake-source',
    state: 'certification_ready',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: ['Synthetic provider is not a real external source.'],
    liveEvidenceRequirements: [],
    freshnessGuard: {
      maxStalenessSeconds: 86_400,
      minimumScanIntervalSeconds: 60,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: false,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'degraded',
      signals: ['synthetic_fixture_freshness', 'scan_history_window'],
    },
    acquisitionMode: 'deterministic_local_adapter',
    approvalOwner: 'engineering',
    termsNotes: 'Local fake provider for MVP certification only.',
    credentialOwnership: 'none',
    quotaModel: 'none',
    retentionNotes: 'Synthetic data only.',
    cursorModel: 'opaque',
    identityStrategy: ['externalId', 'canonicalUrl'],
    supportedContentUnits: ['post', 'link'],
    unsupportedContentUnits: ['comment', 'profile', 'community', 'media'],
    estimatedCostPerScan: 'zero',
    betaEnablementCriteria: [
      'Certification tests pass',
      'No external network dependency',
    ],
    rollbackPlan: 'Disable fake provider registration.',
  },
];
