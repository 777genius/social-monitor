import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  REDACTED_VALUE,
  isSensitiveKey,
  redactSensitiveText,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { FakeSourceProvider } from '../libs/ingestion/adapters/source/fake-source.provider';
import { FixtureGitHubClient } from '../libs/ingestion/adapters/source/github/fixture-github-client';
import {
  GITHUB_ISSUES_PROVIDER_KEY,
  GitHubSourceProvider,
} from '../libs/ingestion/adapters/source/github/github-source.provider';
import { FixtureGitHubRepoRadarClient } from '../libs/ingestion/adapters/source/github-repo-radar/fixture-github-repo-radar-client';
import { FixtureGitHubRepositoryLiveVerifier } from '../libs/ingestion/adapters/source/github-repo-radar/fixture-github-repository-live-verifier';
import { GitHubRepoRadarSourceProvider } from '../libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { FixtureGitHubTrendingPageClient } from '../libs/ingestion/adapters/source/github-trending-page/fixture-github-trending-page-client';
import { GitHubTrendingPageSourceProvider } from '../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider';
import { FixtureHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { FixtureRedditClient } from '../libs/ingestion/adapters/source/reddit/fixture-reddit-client';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import { StaticRedditTokenProvider } from '../libs/ingestion/adapters/source/reddit/static-reddit-token-provider';
import { FixtureRssClient } from '../libs/ingestion/adapters/source/rss/fixture-rss-client';
import { RssSourceProvider } from '../libs/ingestion/adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { minimumScanIntervalSecondsForProvider } from '../libs/monitoring/features/shared/scan-cadence-policy';
import type {
  FetchedSourceItem,
  ProviderFailureKind,
  SourceRuntimeConfig,
  SourceCursorModel,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceQuery,
  SourceQueryMode,
  SourceLiveEvidenceRequirement,
  SourceReadinessFreshnessGuard,
  SourceReadinessState,
} from '../libs/ingestion/ports';

const outputPath = 'ops/ingestion/source-provider-certification.json';
const update = process.argv.includes('--update');
const packageScripts = readPackageScripts();
const fixtureSecret = ['source', 'secret'].join('-');
const authorizationScheme = ['Bear', 'er'].join('');

type ProviderCase = {
  readonly providerFactory: () => SourceProviderPort;
  readonly validQuery: SourceQuery;
  readonly unsupportedQueryMode: SourceQueryMode;
  readonly expectedProviderKey: string;
  readonly expectedReadinessState: SourceReadinessState;
  readonly expectedFailureKind: ProviderFailureKind;
  readonly contextConfig?: SourceRuntimeConfig;
};

type ProviderCertificationReport = {
  readonly providerKey: string;
  readonly readinessState: string;
  readonly runtimeReadiness: string;
  readonly liveBetaReady: boolean;
  readonly liveBetaBlockers: readonly string[];
  readonly liveEvidenceRequirements: readonly SourceLiveEvidenceRequirement[];
  readonly freshnessGuard: SourceReadinessFreshnessGuard;
  readonly productionSafe: boolean;
  readonly cursorModel: SourceCursorModel;
  readonly quotaModel: string;
  readonly itemCount: number;
  readonly warningCount: number;
  readonly firstExternalId: string;
  readonly nextCursor?: string;
  readonly repeatedScanItemCount: number;
  readonly failureKind: ProviderFailureKind;
  readonly checks: readonly string[];
};

type CertificationReport = {
  readonly schemaVersion: 1;
  readonly reportId: string;
  readonly generatedBy: string;
  readonly fixtureMode: 'deterministic_no_network';
  readonly blockingPassed: boolean;
  readonly certifiedProviders: readonly ProviderCertificationReport[];
  readonly deferredProviders: readonly {
    readonly providerKey: string;
    readonly state: string;
    readonly runtimeReadiness: string;
    readonly liveBetaBlockers: readonly string[];
    readonly freshnessGuard: SourceReadinessFreshnessGuard;
    readonly acquisitionMode: string;
  }[];
};

const cases: readonly ProviderCase[] = [
  {
    providerFactory: () => new FakeSourceProvider(),
    validQuery: { mode: 'search', query: 'monitoring' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'fake-source',
    expectedReadinessState: 'certification_ready',
    expectedFailureKind: 'unknown',
  },
  {
    providerFactory: () =>
      new HackerNewsSourceProvider(new FixtureHackerNewsClient()),
    validQuery: { mode: 'search', query: 'monitoring' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'hacker-news',
    expectedReadinessState: 'enabled_beta',
    expectedFailureKind: 'unavailable',
  },
  {
    providerFactory: () => new GitHubSourceProvider(new FixtureGitHubClient()),
    validQuery: {
      mode: 'search',
      query: 'social monitoring repo:777genius/social-monitor',
    },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: GITHUB_ISSUES_PROVIDER_KEY,
    expectedReadinessState: 'enabled_beta',
    expectedFailureKind: 'unavailable',
    contextConfig: {
      maxItems: 1,
    },
  },
  {
    providerFactory: () =>
      new GitHubRepoRadarSourceProvider(
        new FixtureGitHubRepoRadarClient(),
        new FixtureGitHubRepositoryLiveVerifier(),
        { now: () => new Date('2026-06-23T12:00:00.000Z') },
      ),
    validQuery: { mode: 'search', query: 'agents' },
    unsupportedQueryMode: 'listing',
    expectedProviderKey: 'github-repo-radar',
    expectedReadinessState: 'enabled_beta',
    expectedFailureKind: 'unavailable',
    contextConfig: {
      topics: ['ai', 'agents', 'developer-tools'],
      languages: ['TypeScript', 'Rust'],
      windows: ['24h', '48h'],
      minStars: 100,
      maxItems: 2,
      fixtureMode: true,
    },
  },
  {
    providerFactory: () =>
      new GitHubTrendingPageSourceProvider(
        new FixtureGitHubTrendingPageClient(),
        { now: () => new Date('2026-06-24T12:00:00.000Z') },
      ),
    validQuery: { mode: 'listing', query: 'daily' },
    unsupportedQueryMode: 'search',
    expectedProviderKey: 'github-trending-page',
    expectedReadinessState: 'enabled_beta',
    expectedFailureKind: 'unavailable',
    contextConfig: {
      maxItems: 3,
      fixtureMode: true,
    },
  },
  {
    providerFactory: () => new RssSourceProvider(new FixtureRssClient()),
    validQuery: { mode: 'url', query: 'https://example.test/feed.xml' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'rss',
    expectedReadinessState: 'enabled_beta',
    expectedFailureKind: 'unavailable',
  },
  {
    providerFactory: () =>
      new RedditSourceProvider(
        new FixtureRedditClient(),
        new StaticRedditTokenProvider('fixture-reddit-app-token'),
      ),
    validQuery: { mode: 'listing', query: 'observability:hot' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'reddit',
    expectedReadinessState: 'enabled_beta',
    expectedFailureKind: 'unavailable',
    contextConfig: {
      subreddit: 'observability',
      listing: 'hot',
    },
  },
];

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  const readinessByProvider = new Map(
    sourceReadinessProfiles.map((profile) => [profile.providerKey, profile]),
  );
  const enabledBetaProfiles = sourceReadinessProfiles.filter(
    (profile) => profile.state === 'enabled_beta',
  );
  const caseKeys = new Set(
    cases.map((providerCase) => providerCase.expectedProviderKey),
  );

  assert(
    enabledBetaProfiles.every((profile) => caseKeys.has(profile.providerKey)),
    `Every enabled_beta provider must have certification case. Enabled: ${enabledBetaProfiles
      .map((profile) => profile.providerKey)
      .join(', ')}`,
  );
  assert(
    enabledBetaProfiles.every(
      (profile) => profile.runtimeReadiness !== 'deferred',
    ),
    'Enabled beta providers must declare fixture_ready or live_beta_ready runtime readiness',
  );
  for (const profile of sourceReadinessProfiles) {
    assertFreshnessGuard(profile.providerKey, profile);
    assertLiveEvidenceRequirements(profile.providerKey, profile);
  }

  const certifiedProviders = await Promise.all(
    cases.map((providerCase) =>
      certifyProvider(providerCase, readinessByProvider),
    ),
  );
  const deferredProviders = sourceReadinessProfiles
    .filter((profile) => profile.runtimeReadiness === 'deferred')
    .map((profile) => ({
      providerKey: profile.providerKey,
      state: profile.state,
      runtimeReadiness: profile.runtimeReadiness,
      liveBetaBlockers: profile.liveBetaBlockers,
      freshnessGuard: profile.freshnessGuard,
      acquisitionMode: profile.acquisitionMode,
    }))
    .sort((left, right) => left.providerKey.localeCompare(right.providerKey));
  const report: CertificationReport = {
    schemaVersion: 1,
    reportId: 'source-provider-certification-mvp-v1',
    generatedBy: 'npm run check:source-certification',
    fixtureMode: 'deterministic_no_network',
    blockingPassed: true,
    certifiedProviders: certifiedProviders.sort((left, right) =>
      left.providerKey.localeCompare(right.providerKey),
    ),
    deferredProviders,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:source-certification -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, 'utf8'));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:source-certification -- --update`,
    );
  }

  console.log(
    `Source provider certification OK (${report.certifiedProviders.length} providers)`,
  );
}

async function certifyProvider(
  providerCase: ProviderCase,
  readinessByProvider: ReadonlyMap<
    string,
    (typeof sourceReadinessProfiles)[number]
  >,
): Promise<ProviderCertificationReport> {
  const provider = providerCase.providerFactory();
  const profile = provider.capabilityProfile();
  const readiness = readinessByProvider.get(providerCase.expectedProviderKey);
  const context = makeContext(
    providerCase.expectedProviderKey,
    providerCase.contextConfig,
  );
  const validation = provider.validateBinding(providerCase.validQuery);
  const unsupportedValidation = provider.validateBinding({
    ...providerCase.validQuery,
    mode: providerCase.unsupportedQueryMode,
  });

  assert(
    provider.key() === providerCase.expectedProviderKey,
    `${providerCase.expectedProviderKey}: key mismatch`,
  );
  assert(
    profile.providerKey === providerCase.expectedProviderKey,
    `${providerCase.expectedProviderKey}: profile key mismatch`,
  );
  assert(
    readiness !== undefined,
    `${providerCase.expectedProviderKey}: missing source readiness profile`,
  );
  assert(
    readiness.state === providerCase.expectedReadinessState,
    `${providerCase.expectedProviderKey}: readiness profile must be ${providerCase.expectedReadinessState}`,
  );
  assert(
    readiness.runtimeReadiness === 'fixture_ready',
    `${providerCase.expectedProviderKey}: deterministic certification only proves fixture_ready runtime readiness`,
  );
  assert(
    readiness.liveBetaBlockers.length > 0,
    `${providerCase.expectedProviderKey}: fixture-ready providers must declare live beta blockers`,
  );
  assert(
    profile.productionSafe === true,
    `${providerCase.expectedProviderKey}: provider must be productionSafe for beta`,
  );
  assert(
    profile.displayName.trim().length > 0,
    `${providerCase.expectedProviderKey}: displayName is required`,
  );
  assert(
    profile.version >= 1,
    `${providerCase.expectedProviderKey}: version must be >= 1`,
  );
  assert(
    profile.cursorModel === readiness.cursorModel,
    `${providerCase.expectedProviderKey}: cursor model mismatch`,
  );
  assert(
    profile.quotaModel === readiness.quotaModel,
    `${providerCase.expectedProviderKey}: quota model mismatch`,
  );
  assertArrayIncludesAll(
    profile.supportedContentUnits,
    readiness.supportedContentUnits,
    `${providerCase.expectedProviderKey}: content units`,
  );
  assertArrayIntersects(
    profile.stableIdentity,
    readiness.identityStrategy,
    `${providerCase.expectedProviderKey}: identity strategy`,
  );
  assert(
    readiness.betaEnablementCriteria.some((criterion) =>
      criterion.toLowerCase().includes('certification'),
    ),
    `${providerCase.expectedProviderKey}: beta criteria must mention certification`,
  );
  assertFreshnessGuard(providerCase.expectedProviderKey, readiness);
  assert(
    validation.ok,
    `${providerCase.expectedProviderKey}: valid query was rejected`,
  );
  assert(
    !unsupportedValidation.ok,
    `${providerCase.expectedProviderKey}: unsupported query mode was accepted`,
  );

  const plan = provider.planScan(providerCase.validQuery, context);
  assert(
    plan.maxItems > 0 && plan.maxItems <= 100,
    `${providerCase.expectedProviderKey}: maxItems must be bounded`,
  );
  assert(
    plan.query.mode === providerCase.validQuery.mode,
    `${providerCase.expectedProviderKey}: plan mode mismatch`,
  );
  assert(
    plan.query.query === providerCase.validQuery.query,
    `${providerCase.expectedProviderKey}: plan query mismatch`,
  );

  const result = await provider.scan(plan, context);
  assert(
    result.items.length > 0,
    `${providerCase.expectedProviderKey}: fixture scan must return items`,
  );
  assertStableItems(providerCase.expectedProviderKey, result.items, {
    allowEmpty: false,
  });
  assertWarningsAreSafe(providerCase.expectedProviderKey, result.warnings);

  if (profile.cursorModel !== 'none') {
    assert(
      result.nextCursor !== undefined && result.nextCursor.trim().length > 0,
      `${providerCase.expectedProviderKey}: cursor model ${profile.cursorModel} must return nextCursor`,
    );
  }

  const repeatedResult = await provider.scan(
    { ...plan, cursor: result.nextCursor },
    context,
  );
  assertStableItems(providerCase.expectedProviderKey, repeatedResult.items, {
    allowEmpty: true,
  });
  assertWarningsAreSafe(providerCase.expectedProviderKey, repeatedResult.warnings);
  assert(
    repeatedResult.nextCursor === undefined ||
      repeatedResult.nextCursor.trim().length > 0,
    `${providerCase.expectedProviderKey}: repeated scan cursor must be undefined or non-empty`,
  );

  const failure = provider.classifyError(
    new Error('fixture provider failure'),
    context,
  );
  assert(
    failure.kind === providerCase.expectedFailureKind,
    `${providerCase.expectedProviderKey}: failure kind mismatch`,
  );
  assert(
    failure.message.trim().length > 0,
    `${providerCase.expectedProviderKey}: failure message is required`,
  );
  assert(
    typeof failure.retryable === 'boolean',
    `${providerCase.expectedProviderKey}: retryable flag is required`,
  );
  const sensitiveFailure = provider.classifyError(
    new Error(
      `provider failed with Authorization ${authorizationScheme} ${fixtureSecret} access_token=${fixtureSecret} client_secret=${fixtureSecret} at https://user:pass@example.test/feed`,
    ),
    context,
  );
  assert(
    sensitiveFailure.message.includes(REDACTED_VALUE),
    `${providerCase.expectedProviderKey}: sensitive failure message must include redaction marker`,
  );
  assert(
    !sensitiveFailure.message.includes(fixtureSecret) &&
      !sensitiveFailure.message.includes('user:pass'),
    `${providerCase.expectedProviderKey}: sensitive failure message leaked secret material`,
  );

  return {
    providerKey: providerCase.expectedProviderKey,
    readinessState: readiness.state,
    runtimeReadiness: readiness.runtimeReadiness,
    liveBetaReady: false,
    liveBetaBlockers: readiness.liveBetaBlockers,
    liveEvidenceRequirements: readiness.liveEvidenceRequirements,
    freshnessGuard: readiness.freshnessGuard,
    productionSafe: profile.productionSafe,
    cursorModel: profile.cursorModel,
    quotaModel: profile.quotaModel,
    itemCount: result.items.length,
    warningCount: result.warnings.length,
    firstExternalId: result.items[0]?.externalId ?? '',
    nextCursor: result.nextCursor,
    repeatedScanItemCount: repeatedResult.items.length,
    failureKind: failure.kind,
    checks: [
      'capability_profile_matches_readiness',
      'unsupported_query_rejected_before_scan',
      'normalized_items_have_stable_identity',
      'cursor_contract_is_non_empty_for_cursor_models',
      'fixture_repeated_scan_is_deterministic',
      'provider_errors_are_classified',
      'provider_failure_messages_are_redacted',
      'provider_warnings_are_redacted',
      'normalized_metadata_excludes_raw_payload_and_secret_keys',
      'canonical_urls_exclude_userinfo_and_secret_query_params',
      'freshness_guard_declared',
      'minimum_scan_interval_declared',
      'scan_history_required_for_freshness',
      'rate_limit_backoff_declared_for_quota_models',
      'live_evidence_requirements_declared_for_external_beta',
      'live_evidence_verification_commands_exist',
    ],
  };
}

function assertLiveEvidenceRequirements(
  providerKey: string,
  readiness: (typeof sourceReadinessProfiles)[number],
): void {
  const requirements = readiness.liveEvidenceRequirements;
  const signalIds = new Set<string>();

  if (readiness.state === 'enabled_beta') {
    assert(
      requirements.length > 0,
      `${providerKey}: enabled_beta providers must declare live evidence requirements`,
    );
  } else if (readiness.runtimeReadiness === 'deferred') {
    assert(
      requirements.length === 0,
      `${providerKey}: deferred providers must not expose external beta live evidence requirements`,
    );
  }

  for (const requirement of requirements) {
    assert(
      requirement.signalId.trim().length > 0,
      `${providerKey}: live evidence signalId is required`,
    );
    assert(
      !signalIds.has(requirement.signalId),
      `${providerKey}: duplicate live evidence signalId ${requirement.signalId}`,
    );
    signalIds.add(requirement.signalId);
    assert(
      requirement.description.trim().length > 0,
      `${providerKey}: live evidence description is required for ${requirement.signalId}`,
    );
    assert(
      requirement.verificationCommand.trim().startsWith('npm run ') ||
        requirement.verificationCommand.includes(' npm run '),
      `${providerKey}: live evidence verificationCommand must reference an npm script for ${requirement.signalId}`,
    );
    assertVerificationCommandScriptsExist(
      providerKey,
      requirement.signalId,
      requirement.verificationCommand,
    );
    assert(
      requirement.requiredFor === 'external_beta',
      `${providerKey}: live evidence requirement ${requirement.signalId} must be required for external_beta`,
    );
    assert(
      requirement.artifactEnv === undefined ||
        requirement.artifactEnv.trim().endsWith('_EVIDENCE_PATH'),
      `${providerKey}: live evidence artifactEnv must point at an evidence path env for ${requirement.signalId}`,
    );
  }
}

function assertFreshnessGuard(
  providerKey: string,
  readiness: (typeof sourceReadinessProfiles)[number],
): void {
  const guard = readiness.freshnessGuard;
  assert(
    Number.isInteger(guard.maxStalenessSeconds) &&
      guard.maxStalenessSeconds >= 60 &&
      guard.maxStalenessSeconds <= 86_400,
    `${providerKey}: freshness guard maxStalenessSeconds must be 60..86400`,
  );
  assert(
    Number.isInteger(guard.minimumScanIntervalSeconds) &&
      guard.minimumScanIntervalSeconds >= 60 &&
      guard.minimumScanIntervalSeconds <= guard.maxStalenessSeconds,
    `${providerKey}: freshness guard minimumScanIntervalSeconds must be 60..maxStalenessSeconds`,
  );
  assert(
    guard.minimumScanIntervalSeconds === minimumScanIntervalSecondsForProvider(providerKey),
    `${providerKey}: freshness guard minimumScanIntervalSeconds must match scan cadence enforcement`,
  );
  assert(
    guard.skipRecentlyScanned === true,
    `${providerKey}: freshness guard must skip recently scanned bindings`,
  );
  assert(
    guard.scanHistoryRequired === true,
    `${providerKey}: freshness guard must require scan history`,
  );
  assert(
    guard.signals.length > 0 &&
      guard.signals.every((signal) => signal.trim().length > 0),
    `${providerKey}: freshness guard signals are required`,
  );

  if (readiness.cursorModel === 'none') {
    assert(
      guard.cursorResumeRequired === false,
      `${providerKey}: cursorResumeRequired must be false for cursorModel=none`,
    );
  } else {
    assert(
      guard.cursorResumeRequired === true,
      `${providerKey}: cursor models must require cursor resume freshness guard`,
    );
  }

  if (readiness.quotaModel === 'none') {
    assert(
      guard.rateLimitBackoffRequired === false,
      `${providerKey}: rateLimitBackoffRequired must be false when quotaModel=none`,
    );
  } else {
    assert(
      guard.rateLimitBackoffRequired === true,
      `${providerKey}: quota models must require rate-limit backoff`,
    );
  }
}

function makeContext(
  providerKey: string,
  config?: SourceRuntimeConfig,
): SourceProviderScanContext {
  return {
    tenantId: tenantId(`tenant-cert-${providerKey}`),
    workspaceId: workspaceId(`workspace-cert-${providerKey}`),
    sourceBindingId: `source-binding-cert-${providerKey}`,
    scanJobId: `scan-job-cert-${providerKey}`,
    correlationId: `correlation-cert-${providerKey}`,
    ...(config === undefined ? {} : { config }),
  };
}

function assertStableItems(
  providerKey: string,
  items: readonly FetchedSourceItem[],
  options: { readonly allowEmpty: boolean },
): void {
  const externalIds = new Set<string>();
  const canonicalUrls = new Set<string>();

  for (const item of items) {
    assert(
      item.externalId.trim().length > 0,
      `${providerKey}: item externalId is required`,
    );
    assert(
      !externalIds.has(item.externalId),
      `${providerKey}: duplicate externalId ${item.externalId}`,
    );
    externalIds.add(item.externalId);

    assert(
      item.canonicalUrl.trim().length > 0,
      `${providerKey}: item canonicalUrl is required`,
    );
    assert(
      isHttpUrl(item.canonicalUrl),
      `${providerKey}: item canonicalUrl must be http(s): ${item.canonicalUrl}`,
    );
    assert(
      !canonicalUrls.has(item.canonicalUrl),
      `${providerKey}: duplicate canonicalUrl ${item.canonicalUrl}`,
    );
    assertCanonicalUrlIsSafe(providerKey, item.canonicalUrl);
    canonicalUrls.add(item.canonicalUrl);

    assert(
      item.title.trim().length + item.body.trim().length > 0,
      `${providerKey}: item title/body are both empty`,
    );
    assert(
      item.publishedAt instanceof Date,
      `${providerKey}: item publishedAt must be a Date`,
    );
    assert(
      !Number.isNaN(item.publishedAt.getTime()),
      `${providerKey}: item publishedAt must be valid`,
    );
    assert(
      item.publishedAt.getTime() > 0,
      `${providerKey}: item publishedAt must not use an epoch fallback`,
    );
    assertProviderMetadataIsSafe(providerKey, item.metadata);
  }

  if (!options.allowEmpty) {
    assert(
      canonicalUrls.size > 0,
      `${providerKey}: at least one canonical URL is required`,
    );
  }
}

function assertArrayIncludesAll(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  for (const expectedValue of expected) {
    assert(
      actual.includes(expectedValue),
      `${label}: missing ${expectedValue}`,
    );
  }
}

function assertArrayIntersects(
  left: readonly string[],
  right: readonly string[],
  label: string,
): void {
  assert(
    left.some((value) => right.includes(value)),
    `${label}: no shared value`,
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function assertVerificationCommandScriptsExist(
  providerKey: string,
  signalId: string,
  verificationCommand: string,
): void {
  const scriptNames = npmRunScriptNames(verificationCommand);
  assert(
    scriptNames.length > 0,
    `${providerKey}: live evidence command for ${signalId} must include npm run <script>`,
  );

  for (const scriptName of scriptNames) {
    assert(
      packageScripts.has(scriptName),
      `${providerKey}: live evidence command for ${signalId} references missing package script ${scriptName}`,
    );
  }
}

function npmRunScriptNames(command: string): readonly string[] {
  const scripts: string[] = [];
  const matcher = /(?:^|\s)npm\s+run\s+([A-Za-z0-9:_-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(command)) !== null) {
    const scriptName = match[1];
    if (scriptName !== undefined) {
      scripts.push(scriptName);
    }
  }

  return scripts;
}

function readPackageScripts(): ReadonlySet<string> {
  const parsed = JSON.parse(readFileSync('package.json', 'utf8')) as {
    readonly scripts?: unknown;
  };
  const scripts = parsed.scripts;

  assert(
    scripts !== null && typeof scripts === 'object' && !Array.isArray(scripts),
    'package.json scripts must be an object',
  );

  return new Set(Object.keys(scripts));
}

const forbiddenMetadataKeys = new Set([
  'authorization',
  'bearer',
  'cookie',
  'setcookie',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'privatekey',
  'payload',
  'request',
  'response',
  'headers',
  'header',
  'html',
  'json',
]);

function assertProviderMetadataIsSafe(
  providerKey: string,
  value: unknown,
): void {
  const violations = providerMetadataViolations(value);
  assert(
    violations.length === 0,
    `${providerKey}: provider metadata must not retain raw payload, headers or secret-like keys: ${violations.join(', ')}`,
  );
}

function assertWarningsAreSafe(
  providerKey: string,
  warnings: readonly string[],
): void {
  for (const warning of warnings) {
    assert(
      warning.trim().length > 0,
      `${providerKey}: provider warnings must be non-empty`,
    );
    assert(
      redactSensitiveText(warning) === warning,
      `${providerKey}: provider warning leaked secret material`,
    );
  }
}

function assertCanonicalUrlIsSafe(providerKey: string, value: string): void {
  const violations = canonicalUrlViolations(value);
  assert(
    violations.length === 0,
    `${providerKey}: canonicalUrl must not include userinfo or sensitive query params: ${violations.join(', ')}`,
  );
}

function canonicalUrlViolations(value: string): readonly string[] {
  try {
    const url = new URL(value);
    const violations: string[] = [];

    if (url.username.length > 0 || url.password.length > 0) {
      violations.push('userinfo');
    }

    for (const key of url.searchParams.keys()) {
      if (isSensitiveKey(key)) {
        violations.push(`query.${key}`);
      }
    }

    return violations;
  } catch {
    return ['invalid_url'];
  }
}

function providerMetadataViolations(
  value: unknown,
  path = 'metadata',
): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      providerMetadataViolations(item, `${path}[${index}]`),
    );
  }

  if (typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Readonly<Record<string, unknown>>).flatMap(
    ([key, nested]) => {
      const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
      const keyViolations =
        normalizedKey.startsWith('raw') ||
        forbiddenMetadataKeys.has(normalizedKey)
          ? [`${path}.${key}`]
          : [];

      return [
        ...keyViolations,
        ...providerMetadataViolations(nested, `${path}.${key}`),
      ];
    },
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n');
}
