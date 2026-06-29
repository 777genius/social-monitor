import '../../infrastructure/api/interest_coverage_plan_api_dto.dart';
import '../../infrastructure/api/scan_policy_api_dto.dart';
import '../../infrastructure/api/scan_run_api_dto.dart';
import '../../infrastructure/api/source_binding_api_dto.dart';
import '../../infrastructure/api/source_profile_api_dto.dart';
import '../../infrastructure/api/source_summary_api_dto.dart';

const sourceDemoSources = [
  SourceSummaryApiDto(
    id: 'reddit',
    name: 'Reddit',
    credentialHealth: 'healthy',
    healthLabel: 'Healthy',
    capabilityKey: 'sources.reddit',
    capabilityEnabled: true,
    collectionStatus: 'collecting',
  ),
  SourceSummaryApiDto(
    id: 'rss',
    name: 'RSS feeds',
    credentialHealth: 'expired',
    healthLabel: 'OAuth token expired',
    capabilityKey: 'sources.rss',
    capabilityEnabled: true,
    collectionStatus: 'collecting',
    credentialPreview: 'redacted-token-preview',
  ),
  SourceSummaryApiDto(
    id: 'hn',
    name: 'Hacker News',
    credentialHealth: 'healthy',
    healthLabel: 'Healthy',
    capabilityKey: 'sources.hacker_news',
    capabilityEnabled: false,
    collectionStatus: 'paused',
    capabilityDisabledReasonCode: 'provider_beta_disabled',
  ),
];

const sourceDemoProfiles = [
  SourceProfileApiDto(
    providerKey: 'reddit',
    displayName: 'Reddit',
    productionSafe: true,
    readinessState: 'enabled_beta',
    runtimeReadiness: 'live_beta_ready',
    acquisitionMode: 'pull',
    supportedQueryModes: ['keyword', 'boolean'],
    supportedContentUnits: ['posts', 'comments'],
    cursorModel: 'time-based',
    quotaModel: 'rate limit',
    limitations: [
      'Rate limits vary by subreddit and endpoint',
      'Historical depth is limited by platform retention',
    ],
    liveBetaBlockers: [],
    capabilityVersion: 1,
  ),
  SourceProfileApiDto(
    providerKey: 'rss',
    displayName: 'RSS',
    productionSafe: true,
    readinessState: 'enabled_beta',
    runtimeReadiness: 'live_beta_ready',
    acquisitionMode: 'pull',
    supportedQueryModes: ['keyword'],
    supportedContentUnits: ['articles'],
    cursorModel: 'time-based',
    quotaModel: 'rate limit',
    limitations: ['Feeds may have inconsistent metadata'],
    liveBetaBlockers: [],
    capabilityVersion: 1,
  ),
  SourceProfileApiDto(
    providerKey: 'hn',
    displayName: 'Hacker News',
    productionSafe: true,
    readinessState: 'profiled',
    runtimeReadiness: 'deferred',
    acquisitionMode: 'pull',
    supportedQueryModes: ['keyword'],
    supportedContentUnits: ['stories', 'comments'],
    cursorModel: 'time-based',
    quotaModel: 'rate limit',
    limitations: ['Backend integration deferred'],
    liveBetaBlockers: ['No data retrieval in this build'],
  ),
  SourceProfileApiDto(
    providerKey: 'github',
    displayName: 'GitHub',
    productionSafe: true,
    readinessState: 'profiled',
    runtimeReadiness: 'deferred',
    acquisitionMode: 'pull',
    supportedQueryModes: ['keyword', 'boolean'],
    supportedContentUnits: ['issues', 'pull requests'],
    cursorModel: 'time-based',
    quotaModel: 'rate limit',
    limitations: ['Backend integration deferred'],
    liveBetaBlockers: ['No data retrieval in this build'],
  ),
];

final sourceDemoBindings = [
  SourceBindingApiDto(
    id: 'binding-reddit-demo',
    interestId: 'interest-market-risk',
    providerKey: 'reddit',
    capabilityProfileVersion: 1,
    status: 'enabled',
    configPreview: const {
      'mode': 'listing',
      'subreddit': 'startups',
      'listing': 'new',
    },
    createdAt: DateTime.utc(2026, 6, 23, 12),
  ),
  SourceBindingApiDto(
    id: 'binding-rss-demo',
    interestId: 'interest-market-risk',
    providerKey: 'rss',
    capabilityProfileVersion: 1,
    status: 'enabled',
    configPreview: const {'feedUrl': 'https://example.com/feed.xml'},
    createdAt: DateTime.utc(2026, 6, 23, 12, 1),
  ),
];

final sourceDemoScanPolicies = [
  ScanPolicyApiDto(
    id: 'scan-policy-demo',
    sourceBindingId: 'binding-reddit-demo',
    intervalSeconds: 3600,
    freshnessSeconds: 3600,
    retryBudget: 3,
    nextRunAt: DateTime.utc(2026, 6, 23, 13),
    createdAt: DateTime.utc(2026, 6, 23, 12),
  ),
];

final sourceDemoScanStatuses = [
  ScanStatusApiDto(
    scanJobId: 'scan-job-demo',
    sourceBindingId: 'binding-reddit-demo',
    scanPolicyId: 'scan-policy-demo',
    status: 'succeeded',
    userState: 'content_current',
    operatorAction: 'Content is current',
    requestedAt: DateTime.utc(2026, 6, 23, 12),
    enqueuedAt: DateTime.utc(2026, 6, 23, 12),
    completedAt: DateTime.utc(2026, 6, 23, 12, 2),
    latestAttempt: ScanExecutionAttemptApiDto(
      sourceBindingId: 'binding-reddit-demo',
      status: 'succeeded',
      startedAt: DateTime.utc(2026, 6, 23, 12),
      finishedAt: DateTime.utc(2026, 6, 23, 12, 2),
      fetched: 42,
      inserted: 31,
      skippedDuplicates: 8,
      projected: 31,
    ),
  ),
];

const sourceDemoPlan = InterestCoveragePlanApiDto(
  interestId: 'interest-market-risk',
  interestTitle: 'Market risk',
  planningQuery: '"Market risk" OR startups OR competitors',
  normalizedKeywords: ['Market risk', 'startups', 'competitors'],
  coverageGaps: [],
  skippedProviders: [],
  drafts: [
    InterestCoveragePlanDraftApiDto(
      providerKey: 'reddit',
      displayName: 'Reddit',
      status: 'ready',
      confidenceScore: 8,
      priority: 1,
      targetContentUnits: ['post', 'comment', 'link'],
      queryModes: ['search', 'listing'],
      rationale: [
        'Combines keyword search with subreddit listing passes.',
        'Collects comments from matched post threads through OAuth.',
      ],
      warnings: ['Keyword-wide Reddit comment search is not used.'],
      sourceBindingDraft: InterestCoveragePlanBindingDraftApiDto(
        providerKey: 'reddit',
        config: {
          'mode': 'search',
          'query': '"Market risk" OR startups OR competitors',
          'maxItems': 60,
          'scanPasses': [
            {
              'mode': 'search',
              'query': '"Market risk" OR startups OR competitors',
              'includeComments': true,
              'maxCommentsPerPost': 5,
            },
            {
              'mode': 'listing',
              'subreddit': 'startups',
              'listing': 'top',
              'topTime': 'week',
              'includeComments': true,
              'maxCommentsPerPost': 3,
            },
          ],
        },
      ),
      cadenceSuggestion: InterestCoveragePlanCadenceSuggestionApiDto(
        intervalSeconds: 1800,
        freshnessSeconds: 3600,
        retryBudget: 3,
      ),
      alternativeDrafts: [],
    ),
    InterestCoveragePlanDraftApiDto(
      providerKey: 'hacker-news',
      displayName: 'Hacker News',
      status: 'ready',
      confidenceScore: 7,
      priority: 2,
      targetContentUnits: ['post', 'comment', 'link'],
      queryModes: ['search'],
      rationale: [
        'Finds launch-adjacent technical discussion in stories and comments.',
      ],
      warnings: [],
      sourceBindingDraft: InterestCoveragePlanBindingDraftApiDto(
        providerKey: 'hacker-news',
        config: {
          'mode': 'search',
          'query': '"Market risk" OR startups OR competitors',
          'scanPasses': [
            {
              'mode': 'search',
              'target': 'story',
              'query': '"Market risk" OR startups OR competitors',
            },
            {
              'mode': 'search',
              'target': 'comment',
              'query': '"Market risk" OR startups OR competitors',
            },
          ],
        },
      ),
      alternativeDrafts: [],
    ),
  ],
);
