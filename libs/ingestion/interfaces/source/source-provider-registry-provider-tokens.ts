import type { Provider } from '@nestjs/common';

import type { BigQueryGitHubRepoRadarClientOptions } from '../../adapters/source/github-repo-radar/bigquery-github-repo-radar-client';
import {
  resolveSourceProviderRuntimeScope,
  type SourceProviderRuntimeScope,
} from '../../adapters/source/source-provider-runtime-scope';
import {
  RedditAppOnlyTokenProvider,
  type RedditAppOnlyTokenProviderOptions,
} from '../../adapters/source/reddit/app-only-reddit-token-provider';
import {
  RedditRefreshTokenProvider,
  type RedditRefreshTokenProviderOptions,
} from '../../adapters/source/reddit/refresh-token-reddit-token-provider';
import {
  resolveXCollectorRuntimeConfig,
  type XCollectorRuntimeConfig,
} from '../../adapters/source/x-twitter-experimental-daily/x-collector-runtime-config';

export type SourceProviderRuntimeSettings = {
  readonly githubRepoRadarBigQuery: Omit<
    BigQueryGitHubRepoRadarClientOptions,
    'client'
  >;
  readonly redditAppOnlyToken: RedditAppOnlyTokenProviderOptions | null;
  readonly redditRefreshToken: RedditRefreshTokenProviderOptions;
  readonly scope: SourceProviderRuntimeScope;
  readonly xCollector: XCollectorRuntimeConfig | null;
};

export const INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS = Symbol(
  'INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS',
);

export const sourceProviderRuntimeSettingsProvider: Provider = {
  provide: INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS,
  useFactory: (): SourceProviderRuntimeSettings =>
    resolveSourceProviderRuntimeSettings(process.env),
};

export const resolveSourceProviderRuntimeSettings = (
  env: NodeJS.ProcessEnv,
): SourceProviderRuntimeSettings => ({
  githubRepoRadarBigQuery: {
    projectId: emptyToUndefined(env.GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID),
    location: emptyToUndefined(env.GITHUB_REPO_RADAR_BIGQUERY_LOCATION),
    maximumBytesBilled: emptyToUndefined(
      env.GITHUB_REPO_RADAR_BIGQUERY_MAX_BYTES_BILLED,
    ),
    timeoutMs: parseOptionalPositiveInteger(
      env.GITHUB_REPO_RADAR_BIGQUERY_TIMEOUT_MS,
    ),
    jobTimeoutMs: parseOptionalPositiveInteger(
      env.GITHUB_REPO_RADAR_BIGQUERY_JOB_TIMEOUT_MS,
    ),
  },
  redditAppOnlyToken: RedditAppOnlyTokenProvider.optionsFromEnvironment(env),
  redditRefreshToken: RedditRefreshTokenProvider.optionsFromEnvironment(env),
  scope: resolveSourceProviderRuntimeScope(env),
  xCollector: resolveXCollectorRuntimeConfig(env),
});

const emptyToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const parseOptionalPositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const trimmed = emptyToUndefined(value);

  if (trimmed === undefined) {
    return undefined;
  }

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
