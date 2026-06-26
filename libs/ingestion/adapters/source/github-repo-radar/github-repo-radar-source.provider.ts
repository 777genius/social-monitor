import { redactSensitiveText } from '@social-monitor/shared-kernel';

import {
  GITHUB_REPO_RADAR_PROVIDER_KEY,
  githubRepositoryLiveTrendWindows,
  githubRepositoryTrendMetadata,
  githubRepositoryTrendWindows,
  type GitHubRepositoryTrendWindow,
  type GitHubRepositoryTrendMetadataInput,
} from '../../../domain';
import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
  FetchedSourceItem,
} from '../../../ports';
import type { GitHubRepoRadarCandidate, GitHubRepoRadarClientPort } from './github-repo-radar-client.port';
import type { GitHubRepositoryLiveRecord, GitHubRepositoryLiveVerifierPort } from './github-repository-live-verifier.port';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
  displayName: 'GitHub Repo Radar',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['link'],
  supportedQueryModes: ['search'],
  cursorModel: 'time',
  stableIdentity: ['canonicalUrl', 'providerMetadata.repository.fullName'],
  quotaModel: 'per_app',
  limitations: [
    'Uses GH Archive BigQuery WatchEvent aggregation plus GitHub REST live verification. BigQuery quota and GitHub rate limits apply.',
    'History is exact for observed GH Archive windows, but GitHub Trending page itself has no official API.',
  ],
};

export class GitHubRepoRadarSourceProvider implements SourceProviderPort {
  constructor(
    private readonly radarClient: GitHubRepoRadarClientPort,
    private readonly liveVerifier: GitHubRepositoryLiveVerifierPort,
    private readonly clock: { now(): Date },
  ) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    if (query.query.trim().length === 0) {
      return { ok: false, reason: 'GitHub repo radar query must be non-empty' };
    }

    return { ok: true };
  }

  planScan(query: SourceQuery, context: SourceProviderScanContext): SourceProviderScanPlan {
    return {
      query,
      maxItems: readPositiveInteger(context.config?.maxItems, 25, 1, 100),
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    const config = parseConfig(context.config, plan.maxItems);
    const checkedAt = this.clock.now();
    const candidates = await this.radarClient.findTrendingRepositories({
      query: shouldSearchByRepositoryName(config) ? plan.query.query : '',
      topics: config.topics,
      languages: config.languages,
      windows: config.windows,
      minStars: config.minStars,
      limit: config.candidateLimit,
      checkedAt,
      source: config.source,
    });
    const items: FetchedSourceItem[] = [];
    const warnings: string[] = [];

    for (const candidate of candidates) {
      if (items.length >= plan.maxItems) {
        break;
      }

      const live = await this.liveVerifier.verifyRepository({
        fullName: candidate.fullName,
        accessToken: firstNonEmptyString(
          context.config?.accessToken,
          context.config?.apiToken,
          context.config?.bearerToken,
        ),
        userAgent: firstNonEmptyString(context.config?.userAgent),
      });

      if (live === null) {
        warnings.push(`GitHub repository ${candidate.fullName} was not found during live verification.`);
        continue;
      }

      if (config.excludeArchived && live.archived) {
        continue;
      }

      if (config.excludeForks && live.fork) {
        continue;
      }

      if (
        live.totalStars < config.minStars ||
        !matchesLanguages(live, config.languages) ||
        !matchesTopics(live, config.topics)
      ) {
        continue;
      }

      items.push(normalizeRepositoryTrend(candidate, live, checkedAt, config, plan.query.query));
    }

    return {
      items,
      nextCursor: checkedAt.toISOString(),
      warnings,
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage = error instanceof Error ? error.message : 'Unknown GitHub repo radar provider error';
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (rawMessage.includes('401') || lowerMessage.includes('credential') || lowerMessage.includes('permission')) {
      return {
        kind: 'auth_failed',
        retryable: false,
        message,
      };
    }

    if (rawMessage.includes('403') || rawMessage.includes('429') || lowerMessage.includes('rate limit') || lowerMessage.includes('quota')) {
      return {
        kind: 'rate_limited',
        retryable: true,
        message,
      };
    }

    return {
      kind: 'unavailable',
      retryable: true,
      message,
    };
  }
}

type GitHubRepoRadarConfig = {
  readonly topics: readonly string[];
  readonly languages: readonly string[];
  readonly windows: readonly GitHubRepositoryTrendWindow[];
  readonly minStars: number;
  readonly candidateLimit: number;
  readonly excludeForks: boolean;
  readonly excludeArchived: boolean;
  readonly source: GitHubRepositoryTrendMetadataInput['trend']['source'];
};

const parseConfig = (config: SourceProviderScanContext['config'], maxItems: number): GitHubRepoRadarConfig => ({
  topics: readStringArray(config?.topics),
  languages: readStringArray(config?.languages),
  windows: readWindows(config?.windows),
  minStars: readPositiveInteger(config?.minStars, 100, 0, 1_000_000),
  candidateLimit: readPositiveInteger(config?.maxCandidates, Math.min(maxItems * 3, 100), maxItems, 300),
  excludeForks: readBoolean(config?.excludeForks, true),
  excludeArchived: readBoolean(config?.excludeArchived, true),
  source: readBoolean(config?.fixtureMode, false)
    ? 'fixture_gh_archive_plus_github_live'
    : 'gh_archive_bigquery_plus_github_live',
});

const shouldSearchByRepositoryName = (config: GitHubRepoRadarConfig): boolean =>
  config.topics.length === 0 && config.languages.length === 0;

const normalizeRepositoryTrend = (
  candidate: GitHubRepoRadarCandidate,
  live: GitHubRepositoryLiveRecord,
  checkedAt: Date,
  config: GitHubRepoRadarConfig,
  query: string,
) => {
  const metadata = githubRepositoryTrendMetadata({
    repository: {
      fullName: live.fullName,
      url: live.url,
      description: live.description,
      language: live.language,
      topics: live.topics,
      license: live.license,
      forksCount: live.forksCount,
    },
    trend: {
      totalStars: live.totalStars,
      stars24h: candidate.stars24h,
      stars48h: candidate.stars48h,
      stars7d: candidate.stars7d,
      stars30d: candidate.stars30d,
      stars90d: candidate.stars90d,
      rank: candidate.rank,
      primaryWindow: candidate.primaryWindow,
      checkedAt,
      source: config.source,
    },
    sourceCohort: {
      query: shouldSearchByRepositoryName(config) ? query : undefined,
      topics: config.topics,
      languages: config.languages,
    },
  });
  const description = live.description ?? 'No GitHub description available.';
  const growth = [
    `+${candidate.stars24h} stars in 24h`,
    `+${candidate.stars48h} in 48h`,
  ].join(', ');

  return {
    externalId: `github-repo-radar:${live.fullName}:${checkedAt.toISOString()}`,
    canonicalUrl: live.url,
    title: `${live.fullName} is trending on GitHub`,
    body: `${description}\n${growth}. Total stars: ${live.totalStars}.`,
    authorHandle: live.fullName.split('/')[0],
    publishedAt: checkedAt,
    metadata,
  };
};

const matchesLanguages = (
  live: GitHubRepositoryLiveRecord,
  languages: readonly string[],
): boolean =>
  languages.length === 0 ||
  (live.language !== undefined && languages
    .map((language) => language.toLocaleLowerCase('en-US'))
    .includes(live.language.toLocaleLowerCase('en-US')));

const matchesTopics = (
  live: GitHubRepositoryLiveRecord,
  topics: readonly string[],
): boolean => {
  if (topics.length === 0) {
    return true;
  }

  const normalizedTopics = topics.map((topic) => topic.toLocaleLowerCase('en-US'));
  const repositoryTopics = live.topics.map((topic) => topic.toLocaleLowerCase('en-US'));
  const searchableText = [
    live.fullName,
    live.description ?? '',
    live.language ?? '',
    ...live.topics,
  ].join(' ').toLocaleLowerCase('en-US');

  return normalizedTopics.some((topic) =>
    repositoryTopics.includes(topic) || searchableText.includes(topic),
  );
};

const firstNonEmptyString = (...values: readonly unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : [];

const readWindows = (value: unknown): readonly GitHubRepositoryTrendWindow[] => {
  const windows = readStringArray(value)
    .filter((item): item is GitHubRepositoryTrendWindow =>
      githubRepositoryTrendWindows.includes(item as GitHubRepositoryTrendWindow),
    );

  const liveWindows = windows.filter((window) => githubRepositoryLiveTrendWindows.includes(window as never));

  return liveWindows.length === 0 ? githubRepositoryLiveTrendWindows : liveWindows;
};

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`GitHub repo radar config integer must be between ${min} and ${max}`);
  }

  return value;
};
