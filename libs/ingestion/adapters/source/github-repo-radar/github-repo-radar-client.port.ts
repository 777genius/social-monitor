import type { GitHubRepositoryTrendWindow } from '../../../domain';

export type GitHubRepoRadarQuery = {
  readonly query: string;
  readonly topics: readonly string[];
  readonly languages: readonly string[];
  readonly windows: readonly GitHubRepositoryTrendWindow[];
  readonly minStars: number;
  readonly limit: number;
  readonly checkedAt: Date;
  readonly source: 'gh_archive_bigquery_plus_github_live' | 'fixture_gh_archive_plus_github_live';
};

export type GitHubRepoRadarCandidate = {
  readonly fullName: string;
  readonly stars24h: number;
  readonly stars48h: number;
  readonly stars7d: number;
  readonly stars30d: number;
  readonly stars90d: number;
  readonly rank: number;
  readonly primaryWindow: GitHubRepositoryTrendWindow;
};

export interface GitHubRepoRadarClientPort {
  findTrendingRepositories(query: GitHubRepoRadarQuery): Promise<readonly GitHubRepoRadarCandidate[]>;
}
