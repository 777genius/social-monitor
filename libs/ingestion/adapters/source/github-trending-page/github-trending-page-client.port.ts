import type { GitHubTrendingPageWindow } from '../../../domain';

export type GitHubTrendingPageQuery = {
  readonly window: GitHubTrendingPageWindow;
  readonly language?: string;
  readonly spokenLanguage?: string;
  readonly limit: number;
  readonly userAgent?: string;
};

export type GitHubTrendingPageRepository = {
  readonly fullName: string;
  readonly url: string;
  readonly description?: string;
  readonly language?: string;
  readonly totalStars: number;
  readonly forksCount: number;
  readonly starsGained: number;
  readonly rank: number;
};

export interface GitHubTrendingPageClientPort {
  listTrendingRepositories(
    query: GitHubTrendingPageQuery,
  ): Promise<readonly GitHubTrendingPageRepository[]>;
}
