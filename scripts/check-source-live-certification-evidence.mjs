import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
  validateRealEvidenceIdentityStrings,
} from './lib/evidence-provenance.mjs';

const evidencePath = 'ops/ingestion/source-live-certification-evidence.json';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const liveOpenScriptPath = 'scripts/check-live-open-connectors.ts';
const liveOpenCaptureScriptPath = 'scripts/capture-live-open-connectors.mjs';
const redditLiveScriptPath = 'scripts/check-live-reddit-oauth.ts';
const redditLiveCaptureScriptPath = 'scripts/capture-live-reddit-oauth.mjs';
const redditOAuthLocalCallbackScriptPath = 'scripts/reddit-oauth-local-callback.mjs';
const githubRepoRadarLiveScriptPath = 'scripts/check-github-repo-radar-live-smoke.ts';
const githubRepoRadarPrismaLiveE2eScriptPath = 'scripts/check-github-repo-radar-prisma-live-e2e.ts';
const githubTrendingPageLiveScriptPath = 'scripts/check-github-trending-page-live-smoke.ts';
const redditSourceProviderPath = 'libs/ingestion/adapters/source/reddit/reddit-source.provider.ts';
const redditRefreshTokenProviderPath = 'libs/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider.ts';
const liveEvidenceArtifactHelperPath = 'scripts/lib/live-evidence-artifact.ts';
const localTsNodePath = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'ts-node.cmd' : 'ts-node',
);

const evidence = readJson(evidencePath);
const sourceCertification = readJson(sourceCertificationPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:source-live-certification-evidence';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'source-live-certification-evidence';
const liveStatusValues = new Set(['pending_live_evidence', 'passed']);
const liveArtifactFormat = 'source-live-provider-evidence-v1';
const liveArtifactEvidenceKind = 'live_network';
const redditCredentialLifecycleFormat = 'reddit-credential-lifecycle-redacted-v1';
const redditCredentialLifecycleEvidenceKind = 'credential_lifecycle';
const requiredRedditLifecycleOperations = new Set(['create', 'rotate', 'revoke', 'redacted-preview']);
const requiredProviderSignals = new Map([
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
const requiredEvidenceShapeBySignalId = new Map([
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
    'github-trending-page-live-smoke',
    [
      ['summary', 'non_empty_string'],
      ['repositoryCount', 'positive_integer'],
      ['topRankIsOne', 'boolean_true'],
      ['canonicalUrlsObserved', 'boolean_true'],
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
const requiredDeferredProviders = new Set(['telegram', 'x-twitter']);
const fixtureOnlyProviders = new Set(['fake-source']);
const forbiddenExternalBetaBindingProviders = new Set([
  ...fixtureOnlyProviders,
  ...requiredDeferredProviders,
]);
const expectedLiveCommands = new Map([
  ['hacker-news', 'npm run check:live-open-connectors'],
  ['rss', 'npm run check:live-open-connectors'],
  ['github-issues', 'npm run check:live-open-connectors'],
  ['github-repo-radar', 'npm run check:github-repo-radar-prisma-live-e2e'],
  ['github-trending-page', 'npm run check:github-trending-page-live-smoke'],
  ['reddit', 'npm run capture:live-reddit-oauth'],
]);
const forbiddenEvidenceFragments = [
  'bearer ',
  'basic ',
  '://user:',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'reddit_access_token',
  'github_token',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'smk_',
  'whsec_',
];
const requiredRealArtifactGuardFragments = [
  'must not contain example, fixture, synthetic, mock or test markers',
];
const forbiddenRealArtifactMarkerPattern = /(?:^|[-_:.\s])(example|fixture|synthetic|mock|test)(?:$|[-_:.\s])/i;

if (evidence.schemaVersion !== 1) {
  violations.push(`${evidencePath}: schemaVersion must be 1`);
}

if (evidence.scope !== 'backend-only') {
  violations.push(`${evidencePath}: scope must be backend-only`);
}

if (evidence.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${evidencePath}: frontendPolicy must keep frontend deferred`);
}

if (!['hold_until_live_provider_evidence', 'passed'].includes(evidence.externalBetaStatus)) {
  violations.push(`${evidencePath}: externalBetaStatus must hold until live provider evidence or be passed`);
}

if (evidence.sourceCertification !== sourceCertificationPath) {
  violations.push(`${evidencePath}: sourceCertification must reference ${sourceCertificationPath}`);
}

validateSourceCertification();
validateLiveSmokeScripts();
validatePassedArtifactContentSchema();
validateSignalEvidenceSchemaMap();
validateLiveProviderEvidence();
validateExampleArtifacts();
validateEnvironmentArtifacts();
validateDeferredProviders();
validateExternalBetaProviderScope();
validateNoSensitiveEvidenceLiterals();
requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Source live certification evidence OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readEvidenceArtifact(path, label) {
  const serialized = readFileSync(path, 'utf8');
  validateNoSensitiveArtifactContent(serialized, label);
  return JSON.parse(serialized);
}

function validateSourceCertification() {
  if (sourceCertification.fixtureMode !== 'deterministic_no_network') {
    violations.push(`${sourceCertificationPath}: fixture certification must remain deterministic_no_network`);
  }

  const certified = new Map(
    (sourceCertification.certifiedProviders ?? []).map((provider) => [provider.providerKey, provider]),
  );

  for (const providerKey of requiredProviderSignals.keys()) {
    const provider = certified.get(providerKey);
    if (provider === undefined) {
      violations.push(`${sourceCertificationPath}: missing certified provider "${providerKey}"`);
      continue;
    }

    if (provider.readinessState !== 'enabled_beta') {
      violations.push(`${sourceCertificationPath}: provider "${providerKey}" must stay enabled_beta in fixture gate`);
    }
    if (!['fixture_ready', 'live_beta_ready'].includes(provider.runtimeReadiness)) {
      violations.push(`${sourceCertificationPath}: provider "${providerKey}" has unsupported runtimeReadiness`);
    }
    if (provider.liveBetaReady === true && evidence.externalBetaStatus !== 'passed') {
      violations.push(`${sourceCertificationPath}: provider "${providerKey}" cannot be liveBetaReady before evidence passes`);
    }
    if (
      provider.liveBetaReady !== true &&
      (!Array.isArray(provider.liveBetaBlockers) || provider.liveBetaBlockers.length === 0)
    ) {
      violations.push(`${sourceCertificationPath}: provider "${providerKey}" must declare live beta blockers`);
    }
  }

  for (const provider of sourceCertification.certifiedProviders ?? []) {
    if (
      provider.readinessState === 'enabled_beta' &&
      provider.runtimeReadiness !== 'deferred' &&
      !fixtureOnlyProviders.has(provider.providerKey) &&
      !requiredProviderSignals.has(provider.providerKey)
    ) {
      violations.push(
        `${sourceCertificationPath}: enabled_beta provider "${provider.providerKey}" must be covered by source live certification evidence`,
      );
    }
  }

  const fakeSource = certified.get('fake-source');
  if (fakeSource !== undefined && fakeSource.liveBetaReady !== false) {
    violations.push(`${sourceCertificationPath}: fake-source must never claim live beta readiness`);
  }
  if (fakeSource === undefined) {
    violations.push(`${sourceCertificationPath}: fake-source must remain certified as fixture-only evidence`);
  } else {
    if (fakeSource.readinessState !== 'certification_ready') {
      violations.push(`${sourceCertificationPath}: fake-source readinessState must be certification_ready`);
    }
    if (fakeSource.runtimeReadiness !== 'fixture_ready') {
      violations.push(`${sourceCertificationPath}: fake-source runtimeReadiness must be fixture_ready`);
    }
  }
}

function validateLiveSmokeScripts() {
  const liveOpenScript = readFileSync(liveOpenScriptPath, 'utf8');
  const liveOpenCaptureScript = readFileSync(liveOpenCaptureScriptPath, 'utf8');
  const redditLiveScript = readFileSync(redditLiveScriptPath, 'utf8');
  const redditLiveCaptureScript = readFileSync(redditLiveCaptureScriptPath, 'utf8');
  const redditOAuthLocalCallbackScript = readFileSync(redditOAuthLocalCallbackScriptPath, 'utf8');
  const githubRepoRadarLiveScript = readFileSync(githubRepoRadarLiveScriptPath, 'utf8');
  const githubRepoRadarPrismaLiveE2eScript = readFileSync(githubRepoRadarPrismaLiveE2eScriptPath, 'utf8');
  const githubTrendingPageLiveScript = readFileSync(githubTrendingPageLiveScriptPath, 'utf8');
  const redditSourceProviderScript = readFileSync(redditSourceProviderPath, 'utf8');
  const redditRefreshTokenProviderScript = readFileSync(redditRefreshTokenProviderPath, 'utf8');
  const liveEvidenceArtifactHelper = readFileSync(liveEvidenceArtifactHelperPath, 'utf8');

  requireScriptSignals(liveOpenScriptPath, liveOpenScript, [
    ...requiredProviderSignals.get('hacker-news'),
    ...requiredProviderSignals.get('rss'),
    ...requiredProviderSignals.get('github-issues'),
  ]);
  requireScriptSignals(
    githubRepoRadarLiveScriptPath,
    githubRepoRadarLiveScript,
    [
      'github-repo-radar-gh-archive-query',
      'github-repo-radar-live-verification',
      'github-repo-radar-live-smoke',
    ],
  );
  requireScriptSignals(
    githubRepoRadarPrismaLiveE2eScriptPath,
    githubRepoRadarPrismaLiveE2eScript,
    [...requiredProviderSignals.get('github-repo-radar')],
  );
  requireScriptSignals(
    githubTrendingPageLiveScriptPath,
    githubTrendingPageLiveScript,
    [...requiredProviderSignals.get('github-trending-page')],
  );
  requireScriptSignals(redditLiveScriptPath, redditLiveScript, [...requiredProviderSignals.get('reddit')]);

  if (!liveOpenScript.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH')) {
    violations.push(`${liveOpenScriptPath}: live open connector smoke must support redacted evidence artifact output`);
  }
  if (!liveOpenCaptureScript.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH')) {
    violations.push(`${liveOpenCaptureScriptPath}: live open connector capture must write a credentialless evidence env handoff`);
  }
  for (const marker of ['writeEvidenceEnvFile', 'validateEvidenceEnvFilePath', 'validateEvidenceJsonFilePath', 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', 'SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA', 'SOURCE_LIVE_OPERATOR']) {
    if (!liveOpenCaptureScript.includes(marker)) {
      violations.push(`${liveOpenCaptureScriptPath}: live open connector env handoff must include ${marker}`);
    }
  }
  if (!liveOpenCaptureScript.includes('must not use local, fixture, example, mock or test identifiers')) {
    violations.push(`${liveOpenCaptureScriptPath}: live open connector capture must reject non-beta evidence identity values`);
  }
  if (!redditLiveScript.includes('REDDIT_LIVE_EVIDENCE_PATH')) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must support redacted evidence artifact output`);
  }
  if (!redditLiveScript.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH')) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must require credential lifecycle evidence`);
  }
  if (!redditLiveCaptureScript.includes('REDDIT_LIVE_EVIDENCE_ENV_PATH')) {
    violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth capture must write an evidence env handoff`);
  }
  for (const marker of ['writeEvidenceEnvFile', 'validateEvidenceEnvFilePath', 'validateEvidenceJsonFilePath', 'REDDIT_LIVE_EVIDENCE_PATH', 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH', 'SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA', 'SOURCE_LIVE_OPERATOR']) {
    if (!redditLiveCaptureScript.includes(marker)) {
      violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth env handoff must include ${marker}`);
    }
  }
  if (!redditLiveCaptureScript.includes('intentionally does not export secret values')) {
    violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth env handoff must document that OAuth credentials stay out of the handoff`);
  }
  for (const marker of [
    "grant_type: 'refresh_token'",
    'REDDIT_REFRESH_TOKEN',
    "readOptionalEnv('REDDIT_CLIENT_SECRET') ?? ''",
  ]) {
    if (!redditLiveCaptureScript.includes(marker)) {
      violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth capture must support permanent refresh-token credentials through ${marker}`);
    }
  }
  if (!redditLiveCaptureScript.includes('must not use local, fixture, example, mock or test identifiers')) {
    violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth capture must reject non-beta evidence identity values`);
  }
  for (const marker of [
    "duration: 'permanent'",
    'refresh_token',
    'REDDIT_REFRESH_TOKEN',
    'This file stores the permanent refresh token, not a short-lived access token.',
    'did not return refresh_token',
  ]) {
    if (!redditOAuthLocalCallbackScript.includes(marker)) {
      violations.push(`${redditOAuthLocalCallbackScriptPath}: local callback helper must create permanent Reddit refresh-token credentials through ${marker}`);
    }
  }
  if (redditOAuthLocalCallbackScript.includes("['REDDIT_ACCESS_TOKEN', credential")) {
    violations.push(`${redditOAuthLocalCallbackScriptPath}: local callback helper must not persist short-lived REDDIT_ACCESS_TOKEN in the secret env`);
  }
  for (const marker of [
    'refreshTokenProvider',
    'context.config?.refreshToken',
    'context.config?.redditRefreshToken',
    'context.config?.clientId',
    'context.config?.redditClientId',
    'Reddit refresh-token OAuth provider is not configured',
  ]) {
    if (!redditSourceProviderScript.includes(marker)) {
      violations.push(`${redditSourceProviderPath}: runtime Reddit provider must support tenant refresh-token credentials through ${marker}`);
    }
  }
  for (const marker of [
    'grant_type: \'refresh_token\'',
    'refresh_token: request.refreshToken',
    'cacheKeyFor',
    'createHash',
    'redactedBodyPreview',
    'RedditRefreshTokenProviderPort',
  ]) {
    if (!redditRefreshTokenProviderScript.includes(marker)) {
      violations.push(`${redditRefreshTokenProviderPath}: Reddit refresh-token provider must implement safe token exchange through ${marker}`);
    }
  }
  if (!redditLiveScript.includes('fail_closed_without_reddit_access_token')) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must fail closed when REDDIT_ACCESS_TOKEN is missing`);
  }
  if (/SKIPPED:\s*REDDIT_ACCESS_TOKEN is not set/i.test(redditLiveScript)) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must not skip missing REDDIT_ACCESS_TOKEN`);
  }
  if (!liveOpenScript.includes(liveArtifactFormat)) {
    violations.push(`${liveOpenScriptPath}: live open connector smoke must emit ${liveArtifactFormat}`);
  }
  if (!redditLiveScript.includes(liveArtifactFormat)) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must emit ${liveArtifactFormat}`);
  }
  if (!githubRepoRadarPrismaLiveE2eScript.includes('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH')) {
    violations.push(`${githubRepoRadarPrismaLiveE2eScriptPath}: GitHub repo radar Prisma live e2e must support redacted evidence artifact output`);
  }
  if (!githubRepoRadarPrismaLiveE2eScript.includes(liveArtifactFormat)) {
    violations.push(`${githubRepoRadarPrismaLiveE2eScriptPath}: GitHub repo radar Prisma live e2e must emit ${liveArtifactFormat}`);
  }
  if (!githubTrendingPageLiveScript.includes('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH')) {
    violations.push(`${githubTrendingPageLiveScriptPath}: GitHub Trending Page live smoke must support redacted evidence artifact output`);
  }
  if (!githubTrendingPageLiveScript.includes(liveArtifactFormat)) {
    violations.push(`${githubTrendingPageLiveScriptPath}: GitHub Trending Page live smoke must emit ${liveArtifactFormat}`);
  }
  for (const marker of [
    'SOURCE_LIVE_ENVIRONMENT_ID',
    'BACKEND_IMAGE_DIGEST',
    'BACKEND_GIT_COMMIT_SHA',
    'SOURCE_LIVE_OPERATOR',
  ]) {
    if (!githubTrendingPageLiveScript.includes(marker)) {
      violations.push(`${githubTrendingPageLiveScriptPath}: GitHub Trending Page live evidence output must include ${marker}`);
    }
  }
  for (const [scriptPath, scriptSource] of [
    [liveOpenScriptPath, liveOpenScript],
    [redditLiveScriptPath, redditLiveScript],
    [githubRepoRadarPrismaLiveE2eScriptPath, githubRepoRadarPrismaLiveE2eScript],
    [githubTrendingPageLiveScriptPath, githubTrendingPageLiveScript],
  ]) {
    if (!scriptSource.includes('writeLiveEvidenceArtifactAtomically')) {
      violations.push(`${scriptPath}: live smoke script must use the shared private evidence artifact writer`);
    }
  }
  for (const marker of [
    'writeLiveEvidenceArtifactAtomically',
    'validateLiveEvidenceJsonFilePath',
    'readLiveEvidenceArtifactFile',
    'renameSync',
    'temporaryEvidencePath',
    'mode: 0o600',
    'chmodSync',
    '0600-style private file permissions',
    'must not write release evidence into the git workspace',
    'must not point to fixture or example paths',
  ]) {
    if (!liveEvidenceArtifactHelper.includes(marker)) {
      violations.push(`${liveEvidenceArtifactHelperPath}: live evidence artifact helper must include ${marker}`);
    }
  }
  for (const [scriptPath, scriptSource] of [
    [liveOpenCaptureScriptPath, liveOpenCaptureScript],
    [redditLiveCaptureScriptPath, redditLiveCaptureScript],
  ]) {
    for (const marker of ['writeEvidenceEnvFile', 'validateEvidenceJsonFilePath']) {
      if (!scriptSource.includes(marker)) {
        violations.push(`${scriptPath}: live evidence capture script must include ${marker}`);
      }
    }
  }
  validateCaptureOutputPathGuards();
  validateDirectRedditLifecyclePathGuards();
}

function validateCaptureOutputPathGuards() {
  const openWorkspaceArtifactPath = resolve('live-open-connectors-workspace-output.json');
  const openResult = runCaptureExpectingFailure(liveOpenCaptureScriptPath, {
    LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: openWorkspaceArtifactPath,
    LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH: '/tmp/social-monitor-live-open-connectors.env',
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
    BACKEND_IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
    BACKEND_GIT_COMMIT_SHA: 'a'.repeat(40),
    SOURCE_LIVE_OPERATOR: 'source-owner-1',
  });
  if (openResult.exitCode === 0) {
    violations.push(`${liveOpenCaptureScriptPath}: capture must reject workspace LIVE_OPEN_CONNECTORS_EVIDENCE_PATH`);
  } else if (!openResult.output.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH must not write release evidence into the git workspace')) {
    violations.push(`${liveOpenCaptureScriptPath}: workspace artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(openWorkspaceArtifactPath)) {
    violations.push(`${liveOpenCaptureScriptPath}: workspace artifact path rejection must not create ${openWorkspaceArtifactPath}`);
  }

  const redditWorkspaceArtifactPath = resolve('live-reddit-oauth-workspace-output.json');
  const redditResult = runCaptureExpectingFailure(redditLiveCaptureScriptPath, {
    REDDIT_ACCESS_TOKEN: 'reddit-live-access-token-for-path-guard',
    REDDIT_LIVE_EVIDENCE_PATH: redditWorkspaceArtifactPath,
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: '/tmp/social-monitor-reddit-credential-lifecycle.json',
    REDDIT_LIVE_EVIDENCE_ENV_PATH: '/tmp/social-monitor-live-reddit-oauth.env',
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
    BACKEND_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
    BACKEND_GIT_COMMIT_SHA: 'b'.repeat(40),
    SOURCE_LIVE_OPERATOR: 'source-owner-1',
  });
  if (redditResult.exitCode === 0) {
    violations.push(`${redditLiveCaptureScriptPath}: capture must reject workspace REDDIT_LIVE_EVIDENCE_PATH`);
  } else if (!redditResult.output.includes('REDDIT_LIVE_EVIDENCE_PATH must not write release evidence into the git workspace')) {
    violations.push(`${redditLiveCaptureScriptPath}: workspace artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(redditWorkspaceArtifactPath)) {
    violations.push(`${redditLiveCaptureScriptPath}: workspace artifact path rejection must not create ${redditWorkspaceArtifactPath}`);
  }

  const redditLifecycleWorkspaceArtifactPath = resolve('reddit-credential-lifecycle-workspace-output.json');
  const redditLifecycleResult = runCaptureExpectingFailure(redditLiveCaptureScriptPath, {
    REDDIT_ACCESS_TOKEN: 'reddit-live-access-token-for-path-guard',
    REDDIT_LIVE_EVIDENCE_PATH: '/tmp/social-monitor-live-reddit-oauth.json',
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: redditLifecycleWorkspaceArtifactPath,
    REDDIT_LIVE_EVIDENCE_ENV_PATH: '/tmp/social-monitor-live-reddit-oauth.env',
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
    BACKEND_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
    BACKEND_GIT_COMMIT_SHA: 'b'.repeat(40),
    SOURCE_LIVE_OPERATOR: 'source-owner-1',
  });
  if (redditLifecycleResult.exitCode === 0) {
    violations.push(`${redditLiveCaptureScriptPath}: capture must reject workspace REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH`);
  } else if (!redditLifecycleResult.output.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must not write release evidence into the git workspace')) {
    violations.push(`${redditLiveCaptureScriptPath}: workspace lifecycle artifact path rejection must explain evidence path policy`);
  }
  if (existsSync(redditLifecycleWorkspaceArtifactPath)) {
    violations.push(`${redditLiveCaptureScriptPath}: workspace lifecycle artifact path rejection must not create ${redditLifecycleWorkspaceArtifactPath}`);
  }
}

function runCaptureExpectingFailure(scriptPath, env) {
  try {
    execFileSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        ...env,
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function validateDirectRedditLifecyclePathGuards() {
  const workspaceLifecycleArtifactPath = resolve('reddit-live-direct-lifecycle-workspace-output.json');
  const workspaceResult = runLiveRedditSmokeExpectingFailure({
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: workspaceLifecycleArtifactPath,
  });
  if (workspaceResult.exitCode === 0) {
    violations.push(`${redditLiveScriptPath}: direct live smoke must reject workspace REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH`);
  } else if (!workspaceResult.output.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must not write release evidence into the git workspace')) {
    violations.push(`${redditLiveScriptPath}: direct workspace lifecycle rejection must explain evidence path policy`);
  }
  if (existsSync(workspaceLifecycleArtifactPath)) {
    violations.push(`${redditLiveScriptPath}: direct workspace lifecycle rejection must not create ${workspaceLifecycleArtifactPath}`);
  }

  const tempDirectory = mkdtempSync(join(tmpdir(), 'reddit-live-direct-lifecycle-'));
  try {
    const publicLifecycleArtifactPath = join(tempDirectory, 'reddit-credential-lifecycle.json');
    writeFileSync(publicLifecycleArtifactPath, '{}\n', { mode: 0o600 });
    chmodSync(publicLifecycleArtifactPath, 0o644);
    const publicModeResult = runLiveRedditSmokeExpectingFailure({
      REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: publicLifecycleArtifactPath,
    });
    if (publicModeResult.exitCode === 0) {
      violations.push(`${redditLiveScriptPath}: direct live smoke must reject public lifecycle artifact permissions`);
    } else if (!publicModeResult.output.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must use 0600-style private file permissions')) {
      violations.push(`${redditLiveScriptPath}: direct public lifecycle rejection must explain private file mode policy`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function runLiveRedditSmokeExpectingFailure(env) {
  try {
    execFileSync(
      process.execPath,
      [
        'scripts/run-with-timeout.mjs',
        '--timeout-ms',
        '45000',
        '--node-options',
        '--max-old-space-size=1024',
        '--',
        localTsNodePath,
        '-r',
        'tsconfig-paths/register',
        redditLiveScriptPath,
      ],
      {
        env: {
          ...process.env,
          REDDIT_ACCESS_TOKEN: 'reddit-live-access-token-for-direct-path-guard',
          REDDIT_LIVE_EVIDENCE_PATH: '/tmp/social-monitor-live-reddit-direct-path-guard.json',
          SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
          BACKEND_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`,
          BACKEND_GIT_COMMIT_SHA: 'c'.repeat(40),
          SOURCE_LIVE_OPERATOR: 'source-owner-1',
          ...env,
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function requireScriptSignals(scriptPath, scriptSource, signalIds) {
  for (const signalId of signalIds) {
    if (!scriptSource.includes(signalId)) {
      violations.push(`${scriptPath}: live smoke script must cover signalId "${signalId}"`);
    }
  }
}

function validatePassedArtifactContentSchema() {
  const schema = evidence.passedArtifactContentSchema;
  if (typeof schema !== 'object' || schema === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema is required`);
    return;
  }

  if (schema.schemaVersion !== 1) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.schemaVersion must be 1`);
  }
  if (schema.format !== liveArtifactFormat) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.format must be ${liveArtifactFormat}`);
  }
  requireExistingPath(schema.exampleArtifactPath, 'passedArtifactContentSchema.exampleArtifactPath');

  const requiredTopLevelFields = new Set(schema.requiredTopLevelFields ?? []);
  for (const field of [
    'schemaVersion',
    'format',
    'artifactId',
    'environmentId',
    'imageDigest',
    'commitSha',
    'operator',
    'sampledAt',
    'provenance',
    'redaction',
    'providerResults',
  ]) {
    if (!requiredTopLevelFields.has(field)) {
      violations.push(`${evidencePath}: passedArtifactContentSchema.requiredTopLevelFields must include ${field}`);
    }
  }

  const redaction = schema.redactionRequirements;
  if (typeof redaction !== 'object' || redaction === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.redactionRequirements is required`);
  } else {
    for (const field of [
      'secretsIncluded',
      'rawProviderPayloadsIncluded',
      'credentialValuesIncluded',
      'privateNetworkUrlsIncluded',
    ]) {
      if (redaction[field] !== false) {
        violations.push(`${evidencePath}: passedArtifactContentSchema.redactionRequirements.${field} must be false`);
      }
    }
  }

  const signalResult = schema.signalResultRequirements;
  if (typeof signalResult !== 'object' || signalResult === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements is required`);
  } else {
    if (signalResult.status !== 'passed') {
      violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements.status must be passed`);
    }
    for (const field of ['signalId', 'status', 'observedAt', 'evidence']) {
      if (!signalResult.requiredFields?.includes(field)) {
        violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements.requiredFields must include ${field}`);
      }
    }
  }

  validateProvenanceRequirements(schema.provenanceRequirements);
  validateEnvArtifactValidation(schema.envArtifactValidation);
  validateRealArtifactGuards(schema.realArtifactGuards, 'passedArtifactContentSchema.realArtifactGuards');
  validateRedditCredentialLifecycleSchema(schema.lifecycleArtifactSchema);
}

function validateProvenanceRequirements(
  requirements,
  label = 'passedArtifactContentSchema.provenanceRequirements',
  expectedEvidenceKind = liveArtifactEvidenceKind,
) {
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind,
    label,
    sourcePath: evidencePath,
    violations,
  });
}

function validateLiveProviderEvidence() {
  const providers = new Map();
  let hasPendingProvider = false;

  for (const provider of evidence.liveProviderEvidence ?? []) {
    if (providers.has(provider.providerKey)) {
      violations.push(`${evidencePath}: duplicate live provider "${provider.providerKey}"`);
    }
    providers.set(provider.providerKey, provider);

    if (!requiredProviderSignals.has(provider.providerKey)) {
      violations.push(`${evidencePath}: unsupported live provider "${provider.providerKey}"`);
    }
    if (!liveStatusValues.has(provider.status)) {
      violations.push(`${evidencePath}: provider "${provider.providerKey}" has unsupported status "${provider.status}"`);
    }
    if (provider.requiredForExternalBeta !== true) {
      violations.push(`${evidencePath}: provider "${provider.providerKey}" must be required for external beta`);
    }
    if (typeof provider.owner !== 'string' || provider.owner.trim().length === 0) {
      violations.push(`${evidencePath}: provider "${provider.providerKey}" must define owner`);
    }
    if (provider.liveSmokeCommand !== expectedLiveCommands.get(provider.providerKey)) {
      violations.push(`${evidencePath}: provider "${provider.providerKey}" must use expected live smoke command`);
    }
    validateCommand(provider.liveSmokeCommand, `provider "${provider.providerKey}" liveSmokeCommand`);
    validateProviderEvidenceFields(provider);
    validateProviderSignals(provider);

    if (typeof provider.exitCondition !== 'string' || provider.exitCondition.trim().length === 0) {
      violations.push(`${evidencePath}: provider "${provider.providerKey}" must define exitCondition`);
    }

    if (provider.status !== 'passed') {
      hasPendingProvider = true;
    }
  }

  for (const providerKey of requiredProviderSignals.keys()) {
    if (!providers.has(providerKey)) {
      violations.push(`${evidencePath}: missing live provider "${providerKey}"`);
    }
  }

  if (providers.has('fake-source')) {
    violations.push(`${evidencePath}: fake-source must not be a live provider evidence target`);
  }

  if (evidence.externalBetaStatus === 'passed' && hasPendingProvider) {
    violations.push(`${evidencePath}: externalBetaStatus cannot be passed while a provider is pending`);
  }
}

function validateProviderEvidenceFields(provider) {
  if (provider.status === 'pending_live_evidence') {
    for (const field of ['stagingArtifactPath', 'environmentId', 'imageDigest', 'commitSha', 'sampledAt']) {
      if (provider[field] !== null) {
        violations.push(`${evidencePath}: pending provider "${provider.providerKey}" must keep ${field}=null`);
      }
    }
    return;
  }

  requireExistingPath(provider.stagingArtifactPath, `provider "${provider.providerKey}" stagingArtifactPath`);
  for (const field of ['environmentId', 'sampledAt']) {
    if (typeof provider[field] !== 'string' || provider[field].trim().length === 0) {
      violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must define ${field}`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(provider.imageDigest ?? ''))) {
    violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must define immutable imageDigest`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(provider.commitSha ?? ''))) {
    violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must define full commitSha`);
  }
  validatePassedProviderArtifact(provider);
}

function validateProviderSignals(provider) {
  const requiredSignals = requiredProviderSignals.get(provider.providerKey) ?? new Set();
  const signals = new Set();

  for (const signal of provider.signals ?? []) {
    if (signals.has(signal.signalId)) {
      violations.push(`${evidencePath}: duplicate signal "${signal.signalId}" for provider "${provider.providerKey}"`);
    }
    signals.add(signal.signalId);

    if (!requiredSignals.has(signal.signalId)) {
      violations.push(`${evidencePath}: unsupported signal "${signal.signalId}" for provider "${provider.providerKey}"`);
    }
    if (!liveStatusValues.has(signal.status)) {
      violations.push(`${evidencePath}: signal "${signal.signalId}" has unsupported status "${signal.status}"`);
    }
    if (provider.status === 'pending_live_evidence' && signal.status !== 'pending_live_evidence') {
      violations.push(`${evidencePath}: pending provider "${provider.providerKey}" must keep signal "${signal.signalId}" pending`);
    }
    if (provider.status === 'passed' && signal.status !== 'passed') {
      violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must have passed signal "${signal.signalId}"`);
    }
    if (typeof signal.requiredSignal !== 'string' || signal.requiredSignal.trim().length === 0) {
      violations.push(`${evidencePath}: signal "${signal.signalId}" must define requiredSignal`);
    }
  }

  for (const signalId of requiredSignals) {
    if (!signals.has(signalId)) {
      violations.push(`${evidencePath}: provider "${provider.providerKey}" missing signal "${signalId}"`);
    }
  }
}

function validatePassedProviderArtifact(provider) {
  if (typeof provider.stagingArtifactPath !== 'string' || !existsSync(provider.stagingArtifactPath)) {
    return;
  }

  const artifact = readEvidenceArtifact(
    provider.stagingArtifactPath,
    `provider "${provider.providerKey}" stagingArtifactPath`,
  );
  validateLiveProviderArtifact(artifact, {
    label: `provider "${provider.providerKey}" stagingArtifactPath`,
    expectedEnvironmentId: provider.environmentId,
    expectedImageDigest: provider.imageDigest,
    expectedCommitSha: provider.commitSha,
    expectedSampledAt: provider.sampledAt,
    requiredProviders: new Set([provider.providerKey]),
  });
}

function validateExampleArtifacts() {
  const examplePath = evidence.passedArtifactContentSchema?.exampleArtifactPath;
  if (typeof examplePath !== 'string' || !existsSync(examplePath)) {
    return;
  }

  const examples = readJson(examplePath).examples;
  if (!Array.isArray(examples) || examples.length === 0) {
    violations.push(`${examplePath}: examples must be a non-empty array`);
    return;
  }

  const coveredProviders = new Set();
  for (const example of examples) {
    validateLiveProviderArtifact(example, {
      label: `${examplePath}: example "${example.artifactId ?? '<missing>'}"`,
      requiredProviders: undefined,
      allowFixture: true,
    });

    for (const providerResult of example.providerResults ?? []) {
      coveredProviders.add(providerResult.providerKey);
    }
  }

  for (const providerKey of requiredProviderSignals.keys()) {
    if (!coveredProviders.has(providerKey)) {
      violations.push(`${examplePath}: examples must include provider "${providerKey}"`);
    }
  }
}

function validateEnvironmentArtifacts() {
  validateLiveEvidenceEnvArtifact('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', new Set(['hacker-news', 'rss', 'github-issues']));
  validateLiveEvidenceEnvArtifact('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', new Set(['github-repo-radar']));
  validateLiveEvidenceEnvArtifact('REDDIT_LIVE_EVIDENCE_PATH', new Set(['reddit']));
  validateRedditCredentialLifecycleEnvArtifact();
}

function validateLiveEvidenceEnvArtifact(envVar, requiredProviders) {
  const artifactPath = readOptionalEnv(envVar);
  if (artifactPath === undefined) {
    return;
  }
  if (!existsSync(artifactPath)) {
    violations.push(`${envVar}: must reference an existing ${liveArtifactFormat} artifact`);
    return;
  }

  const expectedEnvironmentId = requireEnvWhenArtifactIsPresent(envVar, 'SOURCE_LIVE_ENVIRONMENT_ID');
  const expectedImageDigest = requireEnvWhenArtifactIsPresent(envVar, 'BACKEND_IMAGE_DIGEST');
  const expectedCommitSha = requireEnvWhenArtifactIsPresent(envVar, 'BACKEND_GIT_COMMIT_SHA');
  const expectedOperator = requireEnvWhenArtifactIsPresent(envVar, 'SOURCE_LIVE_OPERATOR');
  const artifact = readEvidenceArtifact(artifactPath, `${envVar} (${artifactPath})`);
  validateLiveProviderArtifact(artifact, {
    label: `${envVar} (${artifactPath})`,
    expectedEnvironmentId,
    expectedImageDigest,
    expectedCommitSha,
    expectedOperator,
    requiredProviders,
  });
}

function validateRedditCredentialLifecycleEnvArtifact() {
  const lifecyclePath = readOptionalEnv('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH');
  if (lifecyclePath === undefined) {
    return;
  }
  if (!existsSync(lifecyclePath)) {
    violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: must reference an existing redacted lifecycle evidence file');
    return;
  }

  const serialized = readFileSync(lifecyclePath, 'utf8');
  const lower = serialized.toLowerCase();
  for (const fragment of forbiddenEvidenceFragments) {
    if (lower.includes(fragment)) {
      violations.push(`REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycle artifact must not contain "${fragment}"`);
    }
  }

  let lifecycleArtifact;
  try {
    lifecycleArtifact = JSON.parse(serialized);
  } catch {
    violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycle artifact must be JSON');
  }
  if (lifecycleArtifact !== undefined) {
    validateRedditCredentialLifecycleArtifact(lifecycleArtifact, {
      label: `REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH (${lifecyclePath})`,
    });
  }

  const lifecycleSha256 = createHash('sha256').update(serialized).digest('hex');
  const redditLivePath = readOptionalEnv('REDDIT_LIVE_EVIDENCE_PATH');
  if (redditLivePath !== undefined && existsSync(redditLivePath)) {
    const redditArtifact = readEvidenceArtifact(redditLivePath, `REDDIT_LIVE_EVIDENCE_PATH (${redditLivePath})`);
    const lifecycleSignal = findSignalResult(redditArtifact, 'reddit', 'reddit-credential-lifecycle');
    if (lifecycleSignal?.evidence?.lifecycleArtifactSha256 !== lifecycleSha256) {
      violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: sha256 must match reddit live evidence lifecycle signal');
    }
  }
}

function findSignalResult(artifact, providerKey, signalId) {
  const provider = (artifact.providerResults ?? []).find((result) => result.providerKey === providerKey);
  return provider?.signalResults?.find((signal) => signal.signalId === signalId);
}

function requireEnvWhenArtifactIsPresent(artifactEnvVar, requiredEnvVar) {
  const value = readOptionalEnv(requiredEnvVar);
  if (value === undefined) {
    violations.push(`${artifactEnvVar}: requires ${requiredEnvVar}`);
  }

  return value;
}

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function validateLiveProviderArtifact(artifact, options) {
  const label = options.label;

  if (artifact.schemaVersion !== 1) {
    violations.push(`${label}: schemaVersion must be 1`);
  }
  if (artifact.format !== liveArtifactFormat) {
    violations.push(`${label}: format must be ${liveArtifactFormat}`);
  }
  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'commitSha', 'operator', 'sampledAt']) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(artifact.imageDigest ?? ''))) {
    violations.push(`${label}: imageDigest must be immutable sha256 digest`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(artifact.commitSha ?? ''))) {
    violations.push(`${label}: commitSha must be a full git commit SHA`);
  }
  if (!isIsoDateString(artifact.sampledAt)) {
    violations.push(`${label}: sampledAt must be an ISO timestamp`);
  }
  if (options.allowFixture !== true) {
    validateRealEvidenceIdentityStrings({
      source: artifact,
      fields: ['environmentId', 'operator'],
      label,
      violations,
      realEvidenceLabel: 'live provider evidence artifacts',
    });
  }
  if (options.expectedEnvironmentId !== undefined && artifact.environmentId !== options.expectedEnvironmentId) {
    violations.push(`${label}: environmentId must match liveProviderEvidence entry`);
  }
  if (options.expectedImageDigest !== undefined && artifact.imageDigest !== options.expectedImageDigest) {
    violations.push(`${label}: imageDigest must match liveProviderEvidence entry`);
  }
  if (options.expectedCommitSha !== undefined && artifact.commitSha !== options.expectedCommitSha) {
    violations.push(`${label}: commitSha must match liveProviderEvidence entry`);
  }
  if (options.expectedSampledAt !== undefined && artifact.sampledAt !== options.expectedSampledAt) {
    violations.push(`${label}: sampledAt must match liveProviderEvidence entry`);
  }
  if (options.expectedOperator !== undefined && artifact.operator !== options.expectedOperator) {
    violations.push(`${label}: operator must match SOURCE_LIVE_OPERATOR`);
  }

  validateArtifactProvenance(artifact.provenance, label, options);
  validateArtifactRedaction(artifact, label);
  if (options.allowFixture !== true) {
    validateNoRealArtifactFixtureMarkers(artifact, label);
  }
  validateNoSensitiveArtifactLiterals(artifact, label);
  validateProviderResults(artifact, options);
}

function validateArtifactProvenance(provenance, label, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label,
    expectedEvidenceKind: liveArtifactEvidenceKind,
    allowFixture: options.allowFixture === true,
    violations,
    realEvidenceLabel: 'live evidence artifacts',
  });
}

function validateRedditCredentialLifecycleSchema(schema) {
  const label = 'passedArtifactContentSchema.lifecycleArtifactSchema';
  if (!isRecord(schema)) {
    violations.push(`${evidencePath}: ${label} is required`);
    return;
  }
  if (schema.format !== redditCredentialLifecycleFormat) {
    violations.push(`${evidencePath}: ${label}.format must be ${redditCredentialLifecycleFormat}`);
  }
  requireExistingPath(schema.exampleArtifactPath, `${label}.exampleArtifactPath`);
  requireFieldListCoverage(
    schema.requiredTopLevelFields,
    [
      'schemaVersion',
      'format',
      'artifactId',
      'environmentId',
      'imageDigest',
      'commitSha',
      'operator',
      'sampledAt',
      'provenance',
      'redaction',
      'lifecycleOperations',
    ],
    `${label}.requiredTopLevelFields`,
  );
  if (Array.isArray(schema.requiredEnv) && schema.requiredEnv.length > 0) {
    violations.push(`${evidencePath}: ${label}.requiredEnv must be empty because lifecycle grants can predate the current release artifact`);
  }
  requireFieldListCoverage(schema.requiredOperations, [...requiredRedditLifecycleOperations], `${label}.requiredOperations`);
  validateProvenanceRequirements(
    schema.provenanceRequirements,
    `${label}.provenanceRequirements`,
    redditCredentialLifecycleEvidenceKind,
  );
  validateRealArtifactGuards(schema.realArtifactGuards, `${label}.realArtifactGuards`);

  const redaction = schema.redactionRequirements;
  if (!isRecord(redaction)) {
    violations.push(`${evidencePath}: ${label}.redactionRequirements is required`);
  } else {
    for (const field of [
      'secretsIncluded',
      'rawProviderPayloadsIncluded',
      'credentialValuesIncluded',
      'privateNetworkUrlsIncluded',
    ]) {
      if (redaction[field] !== false) {
        violations.push(`${evidencePath}: ${label}.redactionRequirements.${field} must be false`);
      }
    }
  }

  if (typeof schema.exampleArtifactPath === 'string' && existsSync(schema.exampleArtifactPath)) {
    validateRedditCredentialLifecycleArtifact(readJson(schema.exampleArtifactPath), {
      label: `${label}.exampleArtifactPath (${schema.exampleArtifactPath})`,
      allowFixture: true,
    });
  }
}

function validateArtifactRedaction(artifact, label) {
  if (typeof artifact.redaction !== 'object' || artifact.redaction === null) {
    violations.push(`${label}: redaction object is required`);
    return;
  }

  for (const field of [
    'secretsIncluded',
    'rawProviderPayloadsIncluded',
    'credentialValuesIncluded',
    'privateNetworkUrlsIncluded',
  ]) {
    if (artifact.redaction[field] !== false) {
      violations.push(`${label}: redaction.${field} must be false`);
    }
  }
}

function validateRedditCredentialLifecycleArtifact(artifact, options) {
  const label = options.label;

  if (!isRecord(artifact)) {
    violations.push(`${label}: artifact must be an object`);
    return;
  }
  if (artifact.schemaVersion !== 1) {
    violations.push(`${label}: schemaVersion must be 1`);
  }
  if (artifact.format !== redditCredentialLifecycleFormat) {
    violations.push(`${label}: format must be ${redditCredentialLifecycleFormat}`);
  }
  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'commitSha', 'operator', 'sampledAt']) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(artifact.imageDigest ?? ''))) {
    violations.push(`${label}: imageDigest must be immutable sha256 digest`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(artifact.commitSha ?? ''))) {
    violations.push(`${label}: commitSha must be a full git commit SHA`);
  }
  if (!isIsoDateString(artifact.sampledAt)) {
    violations.push(`${label}: sampledAt must be an ISO timestamp`);
  }
  if (options.allowFixture !== true) {
    validateRealEvidenceIdentityStrings({
      source: artifact,
      fields: ['environmentId', 'operator'],
      label,
      violations,
      realEvidenceLabel: 'reddit credential lifecycle artifacts',
    });
  }
  if (options.expectedEnvironmentId !== undefined && artifact.environmentId !== options.expectedEnvironmentId) {
    violations.push(`${label}: environmentId must match SOURCE_LIVE_ENVIRONMENT_ID`);
  }
  if (options.expectedImageDigest !== undefined && artifact.imageDigest !== options.expectedImageDigest) {
    violations.push(`${label}: imageDigest must match BACKEND_IMAGE_DIGEST`);
  }
  if (options.expectedCommitSha !== undefined && artifact.commitSha !== options.expectedCommitSha) {
    violations.push(`${label}: commitSha must match BACKEND_GIT_COMMIT_SHA`);
  }
  if (options.expectedOperator !== undefined && artifact.operator !== options.expectedOperator) {
    violations.push(`${label}: operator must match SOURCE_LIVE_OPERATOR`);
  }

  validateEvidenceArtifactProvenance({
    provenance: artifact.provenance,
    label,
    expectedEvidenceKind: redditCredentialLifecycleEvidenceKind,
    allowFixture: options.allowFixture === true,
    violations,
    realEvidenceLabel: 'reddit credential lifecycle artifacts',
  });
  validateArtifactRedaction(artifact, label);
  if (options.allowFixture !== true) {
    validateNoRealArtifactFixtureMarkers(artifact, label);
  }
  validateNoSensitiveArtifactLiterals(artifact, label);
  validateRedditCredentialLifecycleOperations(artifact.lifecycleOperations, label);
}

function validateRedditCredentialLifecycleOperations(operations, label) {
  if (!Array.isArray(operations) || operations.length === 0) {
    violations.push(`${label}: lifecycleOperations must be a non-empty array`);
    return;
  }

  const observedOperations = new Set();
  for (const [index, operation] of operations.entries()) {
    const operationLabel = `${label}: lifecycleOperations[${index}]`;
    if (!isRecord(operation)) {
      violations.push(`${operationLabel} must be an object`);
      continue;
    }
    if (typeof operation.operation !== 'string' || operation.operation.trim().length === 0) {
      violations.push(`${operationLabel}.operation must be a non-empty string`);
    } else {
      observedOperations.add(operation.operation);
      if (!requiredRedditLifecycleOperations.has(operation.operation)) {
        violations.push(`${operationLabel}.operation is unsupported`);
      }
    }
    if (operation.status !== 'passed') {
      violations.push(`${operationLabel}.status must be passed`);
    }
    if (typeof operation.observedAt !== 'string' || operation.observedAt.trim().length === 0) {
      violations.push(`${operationLabel}.observedAt must be a non-empty string`);
    } else if (!isIsoDateString(operation.observedAt)) {
      violations.push(`${operationLabel}.observedAt must be an ISO timestamp`);
    }
    if (!isRecord(operation.evidence)) {
      violations.push(`${operationLabel}.evidence must be an object`);
    } else {
      if (typeof operation.evidence.summary !== 'string' || operation.evidence.summary.trim().length === 0) {
        violations.push(`${operationLabel}.evidence.summary must be a non-empty string`);
      }
      if (operation.evidence.secretValuesRedacted !== true) {
        violations.push(`${operationLabel}.evidence.secretValuesRedacted must be true`);
      }
      if (operation.evidence.auditEventRecorded !== true) {
        violations.push(`${operationLabel}.evidence.auditEventRecorded must be true`);
      }
    }
  }

  for (const operation of requiredRedditLifecycleOperations) {
    if (!observedOperations.has(operation)) {
      violations.push(`${label}: lifecycleOperations must include ${operation}`);
    }
  }
}

function validateNoSensitiveArtifactLiterals(artifact, label) {
  validateNoSensitiveArtifactContent(JSON.stringify(artifact), label);
}

function validateNoSensitiveArtifactContent(content, label) {
  const serialized = content.toLowerCase();

  for (const fragment of forbiddenEvidenceFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${label}: artifact must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateRealArtifactGuards(guards, label) {
  for (const fragment of requiredRealArtifactGuardFragments) {
    if (!Array.isArray(guards) || !guards.some((guard) => String(guard).includes(fragment))) {
      violations.push(`${evidencePath}: ${label} must include "${fragment}"`);
    }
  }
}

function validateNoRealArtifactFixtureMarkers(value, label, path = []) {
  if (typeof value === 'string') {
    const marker = forbiddenRealArtifactMarkerPattern.exec(value);
    if (marker !== null) {
      const fieldPath = path.length === 0 ? '<root>' : path.join('.');
      violations.push(`${label}: ${fieldPath} must not contain fixture marker "${marker[1]}"`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateNoRealArtifactFixtureMarkers(item, label, [...path, `[${index}]`]);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    validateNoRealArtifactFixtureMarkers(item, label, [...path, key]);
  }
}

function validateProviderResults(artifact, options) {
  if (!Array.isArray(artifact.providerResults) || artifact.providerResults.length === 0) {
    violations.push(`${options.label}: providerResults must be a non-empty array`);
    return;
  }

  const providerResults = new Map();
  for (const result of artifact.providerResults) {
    if (providerResults.has(result.providerKey)) {
      violations.push(`${options.label}: duplicate providerResult "${result.providerKey}"`);
      continue;
    }
    providerResults.set(result.providerKey, result);

    if (!requiredProviderSignals.has(result.providerKey)) {
      violations.push(`${options.label}: unsupported providerResult "${result.providerKey}"`);
      continue;
    }
    if (result.status !== 'passed') {
      violations.push(`${options.label}: providerResult "${result.providerKey}" must have status=passed`);
    }
    validateArtifactProviderFreshnessGuard(result, options.label);
    validateArtifactSignalResults(result, options.label);
  }

  const requiredProviders = options.requiredProviders ?? new Set(providerResults.keys());
  for (const providerKey of requiredProviders) {
    if (!providerResults.has(providerKey)) {
      violations.push(`${options.label}: missing providerResult "${providerKey}"`);
    }
  }
}

function validateArtifactSignalResults(providerResult, label) {
  if (!Array.isArray(providerResult.signalResults) || providerResult.signalResults.length === 0) {
    violations.push(`${label}: providerResult "${providerResult.providerKey}" must define signalResults`);
    return;
  }

  const requiredSignals = requiredProviderSignals.get(providerResult.providerKey) ?? new Set();
  const seenSignals = new Set();
  for (const signal of providerResult.signalResults) {
    if (seenSignals.has(signal.signalId)) {
      violations.push(`${label}: duplicate signalResult "${signal.signalId}" for provider "${providerResult.providerKey}"`);
      continue;
    }
    seenSignals.add(signal.signalId);

    if (!requiredSignals.has(signal.signalId)) {
      violations.push(`${label}: unsupported signalResult "${signal.signalId}" for provider "${providerResult.providerKey}"`);
    }
    if (signal.status !== 'passed') {
      violations.push(`${label}: signalResult "${signal.signalId}" must have status=passed`);
    }
    if (typeof signal.observedAt !== 'string' || signal.observedAt.trim().length === 0) {
      violations.push(`${label}: signalResult "${signal.signalId}" must define observedAt`);
    } else if (!isIsoDateString(signal.observedAt)) {
      violations.push(`${label}: signalResult "${signal.signalId}" observedAt must be an ISO timestamp`);
    }
    if (!isRecord(signal.evidence)) {
      violations.push(`${label}: signalResult "${signal.signalId}" must define evidence object`);
    } else {
      validateSignalEvidenceShape(label, signal);
    }
  }

  for (const signalId of requiredSignals) {
    if (!seenSignals.has(signalId)) {
      violations.push(`${label}: provider "${providerResult.providerKey}" missing signalResult "${signalId}"`);
    }
  }
}

function validateArtifactProviderFreshnessGuard(providerResult, label) {
  const expectedGuard = sourceFreshnessGuardForProvider(providerResult.providerKey);
  const guardLabel = `${label}: providerResult "${providerResult.providerKey}".freshnessGuard`;
  if (!isRecord(providerResult.freshnessGuard)) {
    violations.push(`${guardLabel} must be an object matching source provider certification`);
    return;
  }

  for (const field of [
    'maxStalenessSeconds',
    'minimumScanIntervalSeconds',
    'skipRecentlyScanned',
    'scanHistoryRequired',
    'cursorResumeRequired',
    'rateLimitBackoffRequired',
    'staleReadModelState',
    'providerFailureHealthState',
  ]) {
    if (providerResult.freshnessGuard[field] !== expectedGuard?.[field]) {
      violations.push(`${guardLabel}.${field} must match ${sourceCertificationPath}`);
    }
  }

  if (!Array.isArray(providerResult.freshnessGuard.signals) || providerResult.freshnessGuard.signals.length === 0) {
    violations.push(`${guardLabel}.signals must be a non-empty array`);
    return;
  }
  requireExactStringSet(
    providerResult.freshnessGuard.signals,
    expectedGuard?.signals ?? [],
    `${guardLabel}.signals`,
  );
}

function sourceFreshnessGuardForProvider(providerKey) {
  const provider = [
    ...(sourceCertification.certifiedProviders ?? []),
    ...(sourceCertification.deferredProviders ?? []),
  ].find((candidate) => candidate.providerKey === providerKey);
  if (!isRecord(provider?.freshnessGuard)) {
    violations.push(`${sourceCertificationPath}: provider "${providerKey}" must define freshnessGuard`);
    return undefined;
  }

  return provider.freshnessGuard;
}

function validateDeferredProviders() {
  const deferred = new Map();
  const sourceDeferred = new Map(
    (sourceCertification.deferredProviders ?? []).map((provider) => [provider.providerKey, provider]),
  );

  for (const provider of evidence.deferredProviders ?? []) {
    if (deferred.has(provider.providerKey)) {
      violations.push(`${evidencePath}: duplicate deferred provider "${provider.providerKey}"`);
    }
    deferred.set(provider.providerKey, provider);

    if (!requiredDeferredProviders.has(provider.providerKey)) {
      violations.push(`${evidencePath}: unsupported deferred provider "${provider.providerKey}"`);
    }
    if (provider.status !== 'deferred') {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must have status=deferred`);
    }
    if (provider.requiredForExternalBeta !== false) {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must not be required for external beta`);
    }
    if (typeof provider.exitCondition !== 'string' || provider.exitCondition.trim().length === 0) {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must define exitCondition`);
    }

    const sourceProvider = sourceDeferred.get(provider.providerKey);
    if (sourceProvider === undefined) {
      violations.push(`${sourceCertificationPath}: missing deferred provider "${provider.providerKey}"`);
    } else if (sourceProvider.runtimeReadiness !== 'deferred') {
      violations.push(`${sourceCertificationPath}: deferred provider "${provider.providerKey}" must have runtimeReadiness=deferred`);
    }
  }

  for (const providerKey of requiredDeferredProviders) {
    if (!deferred.has(providerKey)) {
      violations.push(`${evidencePath}: missing deferred provider "${providerKey}"`);
    }
  }
}

function validateExternalBetaProviderScope() {
  const scope = evidence.externalBetaProviderScope;
  if (!isRecord(scope)) {
    violations.push(`${evidencePath}: externalBetaProviderScope is required`);
    return;
  }

  requireExactStringSet(
    scope.requiredLiveProviders,
    requiredProviderSignals.keys(),
    'externalBetaProviderScope.requiredLiveProviders',
  );
  requireExactStringSet(
    scope.forbiddenBindingProviders,
    forbiddenExternalBetaBindingProviders,
    'externalBetaProviderScope.forbiddenBindingProviders',
  );
  requireExactStringSet(
    scope.fixtureOnlyProviders,
    fixtureOnlyProviders,
    'externalBetaProviderScope.fixtureOnlyProviders',
  );

  const liveProviders = new Set((evidence.liveProviderEvidence ?? []).map((provider) => provider.providerKey));
  for (const providerKey of forbiddenExternalBetaBindingProviders) {
    if (liveProviders.has(providerKey)) {
      violations.push(`${evidencePath}: forbidden provider "${providerKey}" must not appear in liveProviderEvidence`);
    }
  }
}

function validateNoSensitiveEvidenceLiterals() {
  const serialized = JSON.stringify(evidence).toLowerCase();

  for (const fragment of forbiddenEvidenceFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${evidencePath}: evidence must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateSignalEvidenceSchemaMap() {
  const requiredSignalIds = new Set([...requiredProviderSignals.values()].flatMap((signals) => [...signals]));

  for (const signalId of requiredSignalIds) {
    const shape = requiredEvidenceShapeBySignalId.get(signalId);
    if (!Array.isArray(shape) || shape.length === 0) {
      violations.push(`${evidencePath}: missing signal-specific evidence schema for "${signalId}"`);
      continue;
    }

    const seenFields = new Set();
    for (const [fieldPath, fieldType] of shape) {
      if (typeof fieldPath !== 'string' || fieldPath.trim().length === 0) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" has an empty field path`);
      }
      if (seenFields.has(fieldPath)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" duplicates field "${fieldPath}"`);
      }
      seenFields.add(fieldPath);
      if (!isSupportedEvidenceType(fieldType)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" uses unsupported type "${fieldType}"`);
      }
    }
  }

  for (const signalId of requiredEvidenceShapeBySignalId.keys()) {
    if (!requiredSignalIds.has(signalId)) {
      violations.push(`${evidencePath}: evidence schema references unsupported signal "${signalId}"`);
    }
  }
}

function validateEnvArtifactValidation(validationRules) {
  if (!Array.isArray(validationRules)) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.envArtifactValidation must be an array`);
    return;
  }

  const expectedRules = new Map([
    ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', new Set(['hacker-news', 'rss', 'github-issues'])],
    ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', new Set(['github-repo-radar'])],
    ['GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH', new Set(['github-trending-page'])],
    ['REDDIT_LIVE_EVIDENCE_PATH', new Set(['reddit'])],
  ]);
  const seenRules = new Set();
  for (const [index, rule] of validationRules.entries()) {
    const label = `passedArtifactContentSchema.envArtifactValidation[${index}]`;
    if (!isRecord(rule)) {
      violations.push(`${evidencePath}: ${label} must be an object`);
      continue;
    }
    if (rule.envVar === 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH') {
      seenRules.add(rule.envVar);
      if (rule.kind !== 'reddit-credential-lifecycle-redacted') {
        violations.push(`${evidencePath}: ${label}.kind must be reddit-credential-lifecycle-redacted`);
      }
      if (rule.sha256MustMatchSignal !== 'reddit-credential-lifecycle') {
        violations.push(`${evidencePath}: ${label}.sha256MustMatchSignal must be reddit-credential-lifecycle`);
      }
      if (Array.isArray(rule.requiredEnv) && rule.requiredEnv.length > 0) {
        violations.push(`${evidencePath}: ${label}.requiredEnv must be empty because lifecycle grants can predate the current release artifact`);
      }
      continue;
    }

    const expectedProviders = expectedRules.get(rule.envVar);
    if (expectedProviders === undefined) {
      violations.push(`${evidencePath}: ${label}.envVar is unsupported`);
      continue;
    }
    seenRules.add(rule.envVar);
    requireProviderSetCoverage(new Set(rule.requiredProviders ?? []), expectedProviders, label);
    if (rule.format !== liveArtifactFormat) {
      violations.push(`${evidencePath}: ${label}.format must be ${liveArtifactFormat}`);
    }
    for (const envVar of ['SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA', 'SOURCE_LIVE_OPERATOR']) {
      if (!rule.requiredEnv?.includes(envVar)) {
        violations.push(`${evidencePath}: ${label}.requiredEnv must include ${envVar}`);
      }
    }
  }

  for (const envVar of [
    ...expectedRules.keys(),
    'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
  ]) {
    if (!seenRules.has(envVar)) {
      violations.push(`${evidencePath}: envArtifactValidation must include ${envVar}`);
    }
  }
}

function requireProviderSetCoverage(actual, expected, label) {
  for (const providerKey of expected) {
    if (!actual.has(providerKey)) {
      violations.push(`${evidencePath}: ${label}.requiredProviders must include ${providerKey}`);
    }
  }
}

function requireExactStringSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues ?? []);
  const expected = new Set(expectedValues);

  for (const value of expected) {
    if (!actual.has(value)) {
      violations.push(`${evidencePath}: ${label} must include ${value}`);
    }
  }

  for (const value of actual) {
    if (!expected.has(value)) {
      violations.push(`${evidencePath}: ${label} must not include ${value}`);
    }
  }
}

function requireFieldListCoverage(actualValues, expectedValues, label) {
  const actual = new Set(actualValues ?? []);
  for (const value of expectedValues) {
    if (!actual.has(value)) {
      violations.push(`${evidencePath}: ${label} must include ${value}`);
    }
  }
}

function validateSignalEvidenceShape(label, signal) {
  const shape = requiredEvidenceShapeBySignalId.get(signal.signalId);
  if (shape === undefined) {
    violations.push(`${label}: signalResult "${signal.signalId}" has no evidence schema`);
    return;
  }

  for (const [fieldPath, fieldType] of shape) {
    const value = getPath(signal.evidence, fieldPath);
    if (value === undefined) {
      violations.push(`${label}: signalResult "${signal.signalId}" evidence must include ${fieldPath}`);
      continue;
    }
    if (!matchesEvidenceType(value, fieldType)) {
      violations.push(`${label}: signalResult "${signal.signalId}" evidence.${fieldPath} must be ${fieldType}`);
    }
  }
}

function getPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function matchesEvidenceType(value, fieldType) {
  switch (fieldType) {
    case 'non_empty_string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'positive_integer':
      return Number.isInteger(value) && value > 0;
    case 'non_negative_integer':
      return Number.isInteger(value) && value >= 0;
    case 'boolean_true':
      return value === true;
    case 'non_empty_string_array':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === 'string' && item.trim().length > 0)
      );
    case 'sha256_hex':
      return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    default:
      return false;
  }
}

function isSupportedEvidenceType(fieldType) {
  return new Set([
    'non_empty_string',
    'positive_integer',
    'non_negative_integer',
    'boolean_true',
    'non_empty_string_array',
    'sha256_hex',
  ]).has(fieldType);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function validateCommand(command, label) {
  const scriptName = String(command ?? '').replace(/^npm run /, '');
  if (!String(command ?? '').startsWith('npm run ')) {
    violations.push(`${evidencePath}: ${label} must use npm run`);
    return;
  }
  if (!scripts[scriptName]) {
    violations.push(`${evidencePath}: ${label} references missing npm script "${scriptName}"`);
  }
}

function requireExistingPath(path, label) {
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    violations.push(`${evidencePath}: ${label} must reference an existing path`);
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const sourceDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'source-scope');
  const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'source-provider-live-certification',
  );
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));

  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }

  if (sourceDomain === undefined) {
    violations.push(`${backendOpsPath}: missing source-scope domain`);
  } else {
    if (!sourceDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${gateScript}`);
    }
    if (!sourceDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${gateId}`);
    }
    if (!sourceDomain.artifacts?.includes(evidencePath)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${evidencePath}`);
    }
  }

  if (externalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing source-provider-live-certification group`);
  } else {
    if (!externalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: source-provider-live-certification group must include ${gateScript}`);
    }
    if (!externalGroup.requiredArtifacts?.includes(evidencePath)) {
      violations.push(`${externalReadinessPath}: source-provider-live-certification group must include ${evidencePath}`);
    }
    if (externalGroup.status !== 'blocked_without_live_credentials' && evidence.externalBetaStatus !== 'passed') {
      violations.push(`${externalReadinessPath}: source provider group must stay blocked until live evidence passes`);
    }
  }

  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(evidencePath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${evidencePath}`);
  }
  if (!baselineArtifacts.has(evidence.passedArtifactContentSchema?.exampleArtifactPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include source live certification example artifact path`);
  }
}
