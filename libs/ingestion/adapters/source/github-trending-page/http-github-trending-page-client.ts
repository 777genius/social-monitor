import { parseGitHubTrendingRepositoriesHtml } from './github-trending-page-html-parser';
import type {
  GitHubTrendingPageClientPort,
  GitHubTrendingPageQuery,
  GitHubTrendingPageRepository,
} from './github-trending-page-client.port';

const baseUrl = 'https://github.com';
const defaultTimeoutMs = 10_000;

export class HttpGitHubTrendingPageClient implements GitHubTrendingPageClientPort {
  constructor(private readonly timeoutMs = defaultTimeoutMs) {}

  async listTrendingRepositories(
    query: GitHubTrendingPageQuery,
  ): Promise<readonly GitHubTrendingPageRepository[]> {
    const response = await fetch(trendingUrl(query), {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': query.userAgent ?? 'social-monitor-mvp/0.1',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`GitHub Trending page returned HTTP ${response.status}`);
    }

    return parseGitHubTrendingRepositoriesHtml(
      await response.text(),
      query.limit,
    );
  }
}

const trendingUrl = (query: GitHubTrendingPageQuery): string => {
  const url = new URL(
    query.language === undefined
      ? '/trending'
      : `/trending/${encodeURIComponent(query.language)}`,
    baseUrl,
  );
  url.searchParams.set('since', query.window);

  if (query.spokenLanguage !== undefined) {
    url.searchParams.set('spoken_language_code', query.spokenLanguage);
  }

  return url.toString();
};
