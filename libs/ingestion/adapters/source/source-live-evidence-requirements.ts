import type { SourceLiveEvidenceRequirement } from '../../ports';

const liveEvidenceRequirement = (
  signalId: string,
  description: string,
  verificationCommand: string,
  artifactEnv?: string,
): SourceLiveEvidenceRequirement => ({
  signalId,
  description,
  verificationCommand,
  ...(artifactEnv === undefined ? {} : { artifactEnv }),
  requiredFor: 'external_beta',
});

const openConnectorEvidenceCommand = 'npm run capture:live-open-connectors';
const openConnectorEvidenceEnv = 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH';
const repoRadarEvidenceCommand =
  'npm run check:github-repo-radar-prisma-live-e2e';
const repoRadarEvidenceEnv = 'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH';
const trendingPageEvidenceCommand =
  'npm run check:github-trending-page-live-smoke';
const trendingPageEvidenceEnv = 'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH';
const redditEvidenceCommand = 'npm run capture:live-reddit-oauth';
const redditEvidenceEnv = 'REDDIT_LIVE_EVIDENCE_PATH';

export const hackerNewsLiveEvidenceRequirements = [
  liveEvidenceRequirement(
    'hn-live-http-smoke',
    'Live HN listing/search HTTP calls return normalized public stories.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'hn-rate-limit-evidence',
    'HN timeout, item cap and degradation behavior are recorded.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'hn-provider-failure-classification',
    'HN provider failures are classified without raw payload leakage.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
] as const;

export const rssLiveEvidenceRequirements = [
  liveEvidenceRequirement(
    'rss-allowlisted-live-feeds',
    'Representative allowlisted RSS/Atom feeds return normalized entries.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'rss-http-cache-evidence',
    'ETag and Last-Modified cache behavior is recorded.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'rss-ssrf-proof',
    'Outbound feed URL policy blocks local/private/metadata targets.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'rss-provider-failure-classification',
    'RSS provider failures are classified without raw payload leakage.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
] as const;

export const githubIssuesLiveEvidenceRequirements = [
  liveEvidenceRequirement(
    'github-live-api-smoke',
    'GitHub REST search API returns normalized public issues.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-rate-limit-budget',
    'GitHub API rate-limit budget and timeout behavior are recorded.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-provider-failure-classification',
    'GitHub API failures are classified without raw payload leakage.',
    openConnectorEvidenceCommand,
    openConnectorEvidenceEnv,
  ),
] as const;

export const githubRepoRadarLiveEvidenceRequirements = [
  liveEvidenceRequirement(
    'github-repo-radar-gh-archive-query',
    'GH Archive BigQuery query uses a bounded billing window and returns candidates.',
    repoRadarEvidenceCommand,
    repoRadarEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-repo-radar-live-verification',
    'GitHub REST repository verifier confirms live repository metadata.',
    repoRadarEvidenceCommand,
    repoRadarEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-repo-radar-live-smoke',
    'Repo Radar live smoke produces ranked trend candidates.',
    repoRadarEvidenceCommand,
    repoRadarEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-repo-radar-prisma-live-e2e',
    'Repo Radar live E2E persists source, feed and trend history in Postgres.',
    repoRadarEvidenceCommand,
    repoRadarEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-repo-radar-provider-failure-classification',
    'Repo Radar failures are classified for BigQuery/GitHub failure modes.',
    repoRadarEvidenceCommand,
    repoRadarEvidenceEnv,
  ),
] as const;

export const githubTrendingPageLiveEvidenceRequirements = [
  liveEvidenceRequirement(
    'github-trending-page-live-smoke',
    'GitHub Trending page returns normalized repositories with stars gained.',
    trendingPageEvidenceCommand,
    trendingPageEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-trending-page-parser-drift',
    'Parser drift checks cover repository identity, rank, star-gain fields and warning-free parsing.',
    trendingPageEvidenceCommand,
    trendingPageEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-trending-page-rate-limit-budget',
    'Page fetch timeout and rate-limit behavior are recorded.',
    trendingPageEvidenceCommand,
    trendingPageEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'github-trending-page-provider-failure-classification',
    'Trending page failures are classified without raw HTML retention.',
    trendingPageEvidenceCommand,
    trendingPageEvidenceEnv,
  ),
] as const;

export const redditLiveEvidenceRequirements = [
  liveEvidenceRequirement(
    'reddit-tenant-oauth-smoke',
    'Tenant Reddit OAuth credentials fetch authorized public listings.',
    redditEvidenceCommand,
    redditEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'reddit-auth-failure',
    'Invalid or expired Reddit credentials fail closed without retry storms.',
    redditEvidenceCommand,
    redditEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'reddit-rate-limit-budget',
    'Reddit rate-limit headers and backoff budget are recorded.',
    redditEvidenceCommand,
    redditEvidenceEnv,
  ),
  liveEvidenceRequirement(
    'reddit-credential-lifecycle',
    'Reddit refresh-token create, rotate, revoke and redacted preview are proven.',
    redditEvidenceCommand,
    redditEvidenceEnv,
  ),
] as const;
