import type { SourceReadinessProfile } from '../../ports';
import { hackerNewsLiveEvidenceRequirements, rssLiveEvidenceRequirements } from './source-live-evidence-requirements';

export const sourceReadinessWebProfiles: readonly SourceReadinessProfile[] = [
  {
    providerKey: 'hacker-news',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: [
      'Live HTTP smoke and deployed rate-limit evidence required before external beta.',
    ],
    liveEvidenceRequirements: hackerNewsLiveEvidenceRequirements,
    freshnessGuard: {
      maxStalenessSeconds: 900,
      minimumScanIntervalSeconds: 300,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'down',
      signals: [
        'hn_story_timestamp',
        'scan_history_window',
        'rate_limit_backoff',
      ],
    },
    acquisitionMode: 'official_or_open_api',
    approvalOwner: 'engineering',
    termsNotes:
      'Uses public HN Firebase listings and HN Algolia search endpoints; no credentials required.',
    credentialOwnership: 'none',
    quotaModel: 'per_app',
    retentionNotes:
      'Store normalized public story/comment provenance; avoid raw payload retention by default.',
    cursorModel: 'time',
    identityStrategy: ['providerId', 'canonicalUrl'],
    supportedContentUnits: ['post', 'comment', 'link'],
    unsupportedContentUnits: ['profile', 'community', 'media'],
    estimatedCostPerScan: 'low',
    betaEnablementCriteria: [
      'HN fixtures pass certification',
      'Live HTTP adapter smoke passes',
      'Rate-limit behavior documented',
    ],
    rollbackPlan:
      'Return source health unavailable and stop scheduling HN bindings.',
  },
  {
    providerKey: 'rss',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: [
      'Representative live feed allowlist, HTTP cache and SSRF controls need deployed evidence.',
    ],
    liveEvidenceRequirements: rssLiveEvidenceRequirements,
    freshnessGuard: {
      maxStalenessSeconds: 3_600,
      minimumScanIntervalSeconds: 300,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'degraded',
      signals: [
        'rss_etag_last_modified',
        'scan_history_window',
        'rate_limit_backoff',
      ],
    },
    acquisitionMode: 'feed_polling_with_site_policy_respect',
    approvalOwner: 'engineering',
    termsNotes:
      'Use RSS/Atom feeds with ETag/Last-Modified where available; no broad page scraping.',
    credentialOwnership: 'none',
    quotaModel: 'per_source_binding',
    retentionNotes:
      'Respect publisher policy; raw payload retention disabled unless explicitly allowed.',
    cursorModel: 'etag_last_modified',
    identityStrategy: ['guid', 'canonicalUrl', 'contentHash'],
    supportedContentUnits: ['post', 'link'],
    unsupportedContentUnits: ['comment', 'profile', 'community', 'media'],
    estimatedCostPerScan: 'low_to_medium',
    betaEnablementCriteria: [
      'RSS certification fixtures pass for malformed, duplicate and missing GUID items',
      'HTTP cache headers supported',
      'SSRF URL policy enforced',
    ],
    rollbackPlan:
      'Pause affected feed bindings and expose source health degraded.',
  },
];
