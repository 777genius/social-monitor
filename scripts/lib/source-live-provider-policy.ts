// Provider certification policy, shared by the evidence validator.
export const requiredProviderSignals = new Map<string, Set<string>>([
  ['telegram', new Set(['telegram_public_preview_live'])],
  ['hacker-news', new Set(['hn-live-http-smoke', 'hn-rate-limit-evidence', 'hn-provider-failure-classification'])],
  [
    'rss',
    new Set([
      'rss-allowlisted-live-feeds',
      'rss-http-cache-evidence',
      'rss-ssrf-proof',
      'rss-provider-failure-classification',
    ]),
  ],
  ['github-issues', new Set(['github-live-api-smoke', 'github-rate-limit-budget', 'github-provider-failure-classification'])],
  [
    'github-repo-radar',
    new Set([
      'github-repo-radar-gh-archive-query',
      'github-repo-radar-live-verification',
      'github-repo-radar-live-smoke',
      'github-repo-radar-prisma-live-e2e',
      'github-repo-radar-provider-failure-classification',
    ]),
  ],
  [
    'github-trending-page',
    new Set([
      'github-trending-page-live-smoke',
      'github-trending-page-parser-drift',
      'github-trending-page-rate-limit-budget',
      'github-trending-page-provider-failure-classification',
    ]),
  ],
  [
    'reddit',
    new Set([
      'reddit-tenant-oauth-smoke',
      'reddit-auth-failure',
      'reddit-rate-limit-budget',
      'reddit-credential-lifecycle',
    ]),
  ],
]);
export const requiredEvidenceShapeBySignalId = new Map<string, string[][]>([
  ['telegram_public_preview_live', [['summary', 'non_empty_string'], ['anonymousPreviewObserved', 'boolean_true'], ['stablePostIds', 'boolean_true'], ['historyPageObserved', 'boolean_true']]],
  [
    'hn-live-http-smoke',
    [
      ['summary', 'non_empty_string'],
      ['listingStoryCount', 'positive_integer'],
      ['searchStoryCount', 'positive_integer'],
      ['stableNumericIds', 'boolean_true'],
      ['normalizedIdsSampled', 'boolean_true'],
    ],
  ],
  [
    'hn-rate-limit-evidence',
    [
      ['summary', 'non_empty_string'],
      ['timeoutMs', 'positive_integer'],
      ['maxListingStories', 'positive_integer'],
      ['maxSearchStories', 'positive_integer'],
      ['degradationSignalRecorded', 'boolean_true'],
    ],
  ],
  [
    'hn-provider-failure-classification',
    [
      ['summary', 'non_empty_string'],
      ['failureKindsObserved', 'non_empty_string_array'],
      ['retryPolicyObserved', 'boolean_true'],
      ['classifiedWithoutRawPayloads', 'boolean_true'],
    ],
  ],
  [
    'rss-allowlisted-live-feeds',
    [
      ['summary', 'non_empty_string'],
      ['feedCount', 'positive_integer'],
      ['itemCount', 'positive_integer'],
      ['allowlistMatched', 'boolean_true'],
      ['normalizedItemsObserved', 'boolean_true'],
    ],
  ],
  [
    'rss-http-cache-evidence',
    [
      ['summary', 'non_empty_string'],
      ['cacheValidatorFeedCount', 'positive_integer'],
      ['validatorsObserved', 'non_empty_string_array'],
      ['conditionalReadObserved', 'boolean_true'],
    ],
  ],
  [
    'rss-ssrf-proof',
    [
      ['summary', 'non_empty_string'],
      ['rejectedProbeCount', 'positive_integer'],
      ['blockedTargetClasses', 'non_empty_string_array'],
      ['rejectedBeforeFetch', 'boolean_true'],
    ],
  ],
  [
    'rss-provider-failure-classification',
    [
      ['summary', 'non_empty_string'],
      ['failureKindsObserved', 'non_empty_string_array'],
      ['retryPolicyObserved', 'boolean_true'],
      ['classifiedWithoutRawPayloads', 'boolean_true'],
    ],
  ],
  [
    'github-live-api-smoke',
    [
      ['summary', 'non_empty_string'],
      ['issueCount', 'positive_integer'],
      ['canonicalUrlsObserved', 'boolean_true'],
      ['pullRequestsExcluded', 'boolean_true'],
      ['authMode', 'non_empty_string'],
    ],
  ],
  [
    'github-provider-failure-classification',
    [
      ['summary', 'non_empty_string'],
      ['failureKindsObserved', 'non_empty_string_array'],
      ['retryPolicyObserved', 'boolean_true'],
      ['classifiedWithoutRawPayloads', 'boolean_true'],
    ],
  ],
  [
    'github-rate-limit-budget',
    [
      ['summary', 'non_empty_string'],
      ['coreRemaining', 'non_negative_integer'],
      ['searchRemaining', 'non_negative_integer'],
      ['budgetObserved', 'boolean_true'],
    ],
  ],
  [
    'github-repo-radar-gh-archive-query',
    [
      ['summary', 'non_empty_string'],
      ['repositoryCount', 'positive_integer'],
      ['windowsObserved', 'non_empty_string_array'],
      ['maxBytesBilledConfigured', 'non_empty_string'],
      ['queryBounded', 'boolean_true'],
    ],
  ],
  [
    'github-repo-radar-live-verification',
    [
      ['summary', 'non_empty_string'],
      ['verifiedRepositoryCount', 'positive_integer'],
      ['canonicalUrlsObserved', 'boolean_true'],
      ['repositoryMetadataObserved', 'boolean_true'],
    ],
  ],
  [
    'github-repo-radar-live-smoke',
    [
      ['summary', 'non_empty_string'],
      ['fetched', 'positive_integer'],
      ['inserted', 'positive_integer'],
      ['projected', 'positive_integer'],
      ['sourceNotFixture', 'boolean_true'],
      ['summaryHighlightObserved', 'boolean_true'],
    ],
  ],
  [
    'github-repo-radar-prisma-live-e2e',
    [
      ['summary', 'non_empty_string'],
      ['scanRuns', 'positive_integer'],
      ['sourceItemCount', 'positive_integer'],
      ['feedItemCount', 'positive_integer'],
      ['trendResultCount', 'positive_integer'],
      ['cursorCount', 'positive_integer'],
      ['noDuplicateCursor', 'boolean_true'],
    ],
  ],
  [
    'github-repo-radar-provider-failure-classification',
    [
      ['summary', 'non_empty_string'],
      ['failureKindsObserved', 'non_empty_string_array'],
      ['retryPolicyObserved', 'boolean_true'],
      ['classifiedWithoutRawPayloads', 'boolean_true'],
    ],
  ],
  [
    'github-trending-page-live-smoke',
    [
      ['summary', 'non_empty_string'],
      ['repositoryCount', 'positive_integer'],
      ['topRankIsOne', 'boolean_true'],
      ['canonicalUrlsObserved', 'boolean_true'],
      ['warningsAbsent', 'boolean_true'],
      ['window', 'non_empty_string'],
    ],
  ],
  [
    'github-trending-page-parser-drift',
    [
      ['summary', 'non_empty_string'],
      ['rankObserved', 'boolean_true'],
      ['languageObserved', 'boolean_true'],
      ['starsObserved', 'boolean_true'],
      ['starsGainedObserved', 'boolean_true'],
      ['warningsAbsent', 'boolean_true'],
    ],
  ],
  [
    'github-trending-page-rate-limit-budget',
    [
      ['summary', 'non_empty_string'],
      ['timeoutMs', 'positive_integer'],
      ['maxItems', 'positive_integer'],
      ['degradationSignalRecorded', 'boolean_true'],
    ],
  ],
  [
    'github-trending-page-provider-failure-classification',
    [
      ['summary', 'non_empty_string'],
      ['failureKindsObserved', 'non_empty_string_array'],
      ['retryPolicyObserved', 'boolean_true'],
      ['classifiedWithoutRawPayloads', 'boolean_true'],
    ],
  ],
  [
    'reddit-tenant-oauth-smoke',
    [
      ['summary', 'non_empty_string'],
      ['subreddit', 'non_empty_string'],
      ['listing', 'non_empty_string'],
      ['itemCount', 'positive_integer'],
      ['canonicalUrlsObserved', 'boolean_true'],
      ['warningCount', 'non_negative_integer'],
    ],
  ],
  [
    'reddit-auth-failure',
    [
      ['summary', 'non_empty_string'],
      ['status', 'non_empty_string'],
      ['failedClosed', 'boolean_true'],
    ],
  ],
  [
    'reddit-rate-limit-budget',
    [
      ['summary', 'non_empty_string'],
      ['headersObserved', 'boolean_true'],
      ['observedHeaderNames', 'non_empty_string_array'],
    ],
  ],
  [
    'reddit-credential-lifecycle',
    [
      ['summary', 'non_empty_string'],
      ['lifecycleArtifactSha256', 'sha256_hex'],
      ['redactionChecked', 'boolean_true'],
      ['lifecycleOperations', 'non_empty_string_array'],
    ],
  ],
]);
export const requiredDeferredProviders = new Set(['x-twitter']);
export const fixtureOnlyProviders = new Set(['fake-source']);
export const forbiddenExternalBetaBindingProviders = new Set([
  ...fixtureOnlyProviders,
  ...requiredDeferredProviders,
]);
export const expectedLiveCommands = new Map([
  ['telegram', 'npm run check:live-telegram-preview'],
  ['hacker-news', 'npm run check:live-open-connectors'],
  ['rss', 'npm run check:live-open-connectors'],
  ['github-issues', 'npm run check:live-open-connectors'],
  ['github-repo-radar', 'npm run check:github-repo-radar-prisma-live-e2e'],
  ['github-trending-page', 'npm run capture:live-github-trending-page'],
  ['reddit', 'npm run capture:live-reddit-oauth'],
]);
export const expectedCertificationRequirementCommands = new Map([
  ['telegram', 'npm run check:live-telegram-preview'],
  ['hacker-news', 'npm run capture:live-open-connectors'],
  ['rss', 'npm run capture:live-open-connectors'],
  ['github-issues', 'npm run capture:live-open-connectors'],
  ['github-repo-radar', 'npm run check:github-repo-radar-prisma-live-e2e'],
  ['github-trending-page', 'npm run capture:live-github-trending-page'],
  ['reddit', 'npm run capture:live-reddit-oauth'],
]);
export const expectedCertificationArtifactEnvs = new Map([
  ['telegram', 'SOURCE_TELEGRAM_LIVE_EVIDENCE_PATH'],
  ['hacker-news', 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH'],
  ['rss', 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH'],
  ['github-issues', 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH'],
  ['github-repo-radar', 'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH'],
  ['github-trending-page', 'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH'],
  ['reddit', 'REDDIT_LIVE_EVIDENCE_PATH'],
]);
