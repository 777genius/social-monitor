import type { SourceReadinessProfile } from '../../ports';
import { githubIssuesLiveEvidenceRequirements, githubRepoRadarLiveEvidenceRequirements, githubTrendingPageLiveEvidenceRequirements } from './source-live-evidence-requirements';

export const sourceReadinessGithubProfiles: readonly SourceReadinessProfile[] = [
  {
    providerKey: 'github-issues',
    state: 'manual_only',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: [
      'GitHub issues collection is disabled by default; set GITHUB_ISSUES_COLLECTOR_ENABLED=1 for a separate issue-focused run.',
      'Live GitHub issues API smoke and deployed rate-limit budget evidence required before external beta.',
    ],
    liveEvidenceRequirements: githubIssuesLiveEvidenceRequirements,
    freshnessGuard: {
      maxStalenessSeconds: 1_800,
      minimumScanIntervalSeconds: 300,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'down',
      signals: [
        'github_search_updated_at',
        'scan_history_window',
        'rate_limit_backoff',
      ],
    },
    acquisitionMode: 'official_or_open_api',
    approvalOwner: 'engineering',
    termsNotes:
      'Uses GitHub REST search API for public issues; no GitHub UI scraping.',
    credentialOwnership: 'none',
    quotaModel: 'per_app',
    retentionNotes:
      'Store normalized public issue provenance; avoid raw payload retention by default.',
    cursorModel: 'page_token',
    identityStrategy: ['providerId', 'canonicalUrl'],
    supportedContentUnits: ['post', 'comment', 'link'],
    unsupportedContentUnits: ['profile', 'community', 'media'],
    estimatedCostPerScan: 'low_with_strict_rate_limits',
    betaEnablementCriteria: [
      'GitHub issues certification fixtures pass',
      'Official REST API path only',
      'Rate-limit behavior documented',
    ],
    rollbackPlan:
      'Pause GitHub issues bindings and expose source health rate_limited or degraded.',
  },
  {
    providerKey: 'github-repo-radar',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: [
      'GH Archive access evidence, BigQuery quota evidence for long windows or bounded public HTTP archive evidence for short windows, npm run check:github-repo-radar-live-smoke, npm run check:github-repo-radar-prisma-live-e2e and GitHub live verification rate-limit budget required before external beta.',
    ],
    liveEvidenceRequirements: githubRepoRadarLiveEvidenceRequirements,
    freshnessGuard: {
      maxStalenessSeconds: 21_600,
      minimumScanIntervalSeconds: 21_600,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'down',
      signals: [
        'gh_archive_window_end',
        'repository_snapshot_checked_at',
        'rate_limit_backoff',
      ],
    },
    acquisitionMode: 'official_or_open_api',
    approvalOwner: 'engineering',
    termsNotes:
      'Uses GH Archive public dataset through BigQuery or bounded hourly HTTP archives, plus GitHub REST repository API; no GitHub UI scraping.',
    credentialOwnership: 'app',
    quotaModel: 'per_app',
    retentionNotes:
      'Store normalized public repository trend metadata and daily snapshots; raw BigQuery rows are not retained.',
    cursorModel: 'time',
    identityStrategy: ['repositoryFullName', 'canonicalUrl', 'checkedAt'],
    supportedContentUnits: ['link'],
    unsupportedContentUnits: [
      'post',
      'comment',
      'profile',
      'community',
      'media',
    ],
    estimatedCostPerScan: 'medium_with_bigquery_cost_guard',
    betaEnablementCriteria: [
      'Fixture certification passes',
      'BigQuery maximumBytesBilled is configured for long windows or public HTTP archive windows are explicitly bounded',
      'GITHUB_REPO_RADAR_LIVE_SMOKE=1 npm run check:github-repo-radar-live-smoke passes in staging',
      'GITHUB_REPO_RADAR_PRISMA_LIVE_E2E=1 npm run check:github-repo-radar-prisma-live-e2e proves Postgres source/feed/trend persistence',
      'GitHub REST live verifier rate-limit behavior documented',
      'Trend history persistence smoke passes',
    ],
    rollbackPlan:
      'Pause GitHub repo radar bindings and expose source health gh_archive_unavailable, bigquery_unavailable or rate_limited.',
  },
  {
    providerKey: 'github-trending-page',
    state: 'enabled_beta',
    runtimeReadiness: 'fixture_ready',
    liveBetaBlockers: [
      'Representative live page smoke, parser drift alert and rate-limit evidence required before external beta.',
    ],
    liveEvidenceRequirements: githubTrendingPageLiveEvidenceRequirements,
    freshnessGuard: {
      maxStalenessSeconds: 86_400,
      minimumScanIntervalSeconds: 86_400,
      skipRecentlyScanned: true,
      scanHistoryRequired: true,
      cursorResumeRequired: true,
      rateLimitBackoffRequired: true,
      staleReadModelState: 'stale',
      providerFailureHealthState: 'degraded',
      signals: [
        'github_trending_since_window',
        'repository_rank_checked_at',
        'rate_limit_backoff',
      ],
    },
    acquisitionMode: 'public_page_with_site_policy_respect',
    approvalOwner: 'engineering',
    termsNotes:
      'Uses the public GitHub Trending page only for normalized repository rank and star-gain signals.',
    credentialOwnership: 'none',
    quotaModel: 'per_app',
    retentionNotes:
      'Store normalized public repository trend metadata; do not retain raw GitHub HTML by default.',
    cursorModel: 'time',
    identityStrategy: [
      'repositoryFullName',
      'canonicalUrl',
      'window',
      'checkedAt',
    ],
    supportedContentUnits: ['link'],
    unsupportedContentUnits: [
      'post',
      'comment',
      'profile',
      'community',
      'media',
    ],
    estimatedCostPerScan: 'low_with_page_rate_limit_guard',
    betaEnablementCriteria: [
      'Fixture certification passes',
      'HTML parser drift test covers repository name, rank, language, stars and stars gained',
      'npm run check:github-trending-page-html-e2e proves HTML parsing through ingestion and feed projection',
      'Live HTTP smoke records top repositories from github.com/trending?since=daily',
      'Reader reader summary separates GitHub Trending Page from Repo Radar',
    ],
    rollbackPlan:
      'Pause GitHub Trending page bindings and keep GH Archive repo radar enabled.',
  },
];
