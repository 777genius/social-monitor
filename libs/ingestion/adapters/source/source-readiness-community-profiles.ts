import type { SourceReadinessProfile } from '../../ports';
import { redditLiveEvidenceRequirements } from './source-live-evidence-requirements';

export const sourceReadinessCommunityProfiles: readonly SourceReadinessProfile[] = [
  {
    providerKey: 'reddit',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: [
      'App-only OAuth client credentials and live Reddit API rate-limit evidence required before external beta.',
    ],
    liveEvidenceRequirements: redditLiveEvidenceRequirements,
    freshnessGuard: {
      maxStalenessSeconds: 900,
      minimumScanIntervalSeconds: 900,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'down',
      signals: [
        'reddit_listing_after_cursor',
        'scan_history_window',
        'rate_limit_backoff',
      ],
    },
    acquisitionMode: 'official_oauth_api',
    approvalOwner: 'product_and_legal',
    termsNotes:
      'Uses Reddit OAuth API only; no unsafe scraping or bypassing platform controls.',
    credentialOwnership: 'app_with_optional_tenant_override',
    quotaModel: 'per_app',
    retentionNotes:
      'Store normalized public post provenance; raw payload retention disabled unless explicitly approved.',
    cursorModel: 'opaque',
    identityStrategy: ['providerId', 'canonicalUrl'],
    supportedContentUnits: ['post', 'comment', 'community', 'link'],
    unsupportedContentUnits: ['profile', 'media'],
    estimatedCostPerScan: 'low_to_medium_depending_on_reddit_quota',
    betaEnablementCriteria: [
      'Reddit app-only OAuth client credentials supplied through runtime secret boundary',
      'Optional tenant OAuth override remains encrypted and scoped',
      'Certification fixtures pass',
      'Backpressure and rate-limit metrics enabled',
    ],
    rollbackPlan:
      'Pause Reddit bindings and expose source health auth_failed or rate_limited.',
  },
  {
    providerKey: 'x-twitter',
    state: 'provider_only',
    runtimeReadiness: 'deferred',
    liveBetaBlockers: [
      'Production product binding is backed by private x-collector/scweet runtime and must be explicitly enabled.',
      'Daily account caps, x-collector health and rate-limit backoff evidence must be captured before broad rollout.',
    ],
    liveEvidenceRequirements: [],
    freshnessGuard: {
      maxStalenessSeconds: 86_400,
      minimumScanIntervalSeconds: 86_400,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: false,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'down',
      signals: [
        'x_daily_window',
        'x_collector_grpc_status',
        'x_collector_rate_limit_backoff',
      ],
    },
    acquisitionMode: 'x_collector_scweet',
    approvalOwner: 'product_and_engineering',
    termsNotes:
      'Canonical X/Twitter product source is implemented through the private x-collector service; Scweet does not leak into product contracts.',
    credentialOwnership: 'app_research_accounts',
    quotaModel: 'per_credential',
    retentionNotes:
      'Store normalized public post provenance and engagement metadata; do not retain raw X payloads by default.',
    cursorModel: 'none',
    identityStrategy: ['providerId', 'canonicalUrl'],
    supportedContentUnits: ['post', 'media', 'link'],
    unsupportedContentUnits: ['comment', 'profile', 'community'],
    estimatedCostPerScan: 'low_cash_cost_high_operational_risk',
    betaEnablementCriteria: [
      'Explicit X_COLLECTOR_ENABLED opt-in flag and gRPC address are configured',
      'Daily account caps and collector cooldown evidence are captured',
      'Source bindings use canonical providerKey x-twitter',
      'Rollback disables X_COLLECTOR_ENABLED',
    ],
    rollbackPlan:
      'Unset X_COLLECTOR_ENABLED or remove X_COLLECTOR_GRPC_ADDRESS.',
  },
  {
    providerKey: 'telegram',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: [
      'Live anonymous preview, pagination, rate-limit and HTML-change evidence is required before external beta certification.',
    ],
    liveEvidenceRequirements: [{
      signalId: 'telegram_public_preview_live',
      description: 'Anonymous public-channel preview, persisted catchup and incomplete coverage are verified in the deployed environment.',
      verificationCommand: 'npm run check:live-telegram-preview',
      requiredFor: 'external_beta',
      artifactEnv: 'SOURCE_TELEGRAM_LIVE_EVIDENCE_PATH',
    }],
    freshnessGuard: {
      maxStalenessSeconds: 3_600,
      minimumScanIntervalSeconds: 3_600,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'degraded',
      signals: [
        'telegram_message_cursor',
        'scan_history_window',
        'rate_limit_backoff',
      ],
    },
    acquisitionMode: 'anonymous_public_web_preview',
    approvalOwner: 'product_and_engineering',
    termsNotes: 'Public t.me/s previews only. No private/invite/login access, account sessions or bots.',
    credentialOwnership: 'none',
    quotaModel: 'per_source_binding',
    retentionNotes:
      'Normalized publicly visible text and provenance only; no raw HTML retention.',
    cursorModel: 'since_id',
    identityStrategy: ['channel', 'messageId'],
    supportedContentUnits: ['post', 'link'],
    unsupportedContentUnits: ['profile', 'community', 'comment', 'media'],
    estimatedCostPerScan: 'low',
    betaEnablementCriteria: [
      'Anonymous preview fixture certification passes',
      'Cursor resumes incomplete backfill without losing unprocessed posts',
      'Live deployed rate-limit and preview coverage evidence is captured',
    ],
    rollbackPlan: 'Pause Telegram source bindings; retained cursors and normalized items remain available.',
  },
];
