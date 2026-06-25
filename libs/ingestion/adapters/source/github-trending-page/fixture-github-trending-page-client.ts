import type {
  GitHubTrendingPageClientPort,
  GitHubTrendingPageQuery,
  GitHubTrendingPageRepository,
} from './github-trending-page-client.port';

const fixtureRepositories: readonly GitHubTrendingPageRepository[] = [
  {
    fullName: 'calesthio/OpenMontage',
    url: 'https://github.com/calesthio/OpenMontage',
    description:
      "World's first open-source, agentic video production system. Turn your AI coding assistant into a full video production studio.",
    language: 'Python',
    totalStars: 18398,
    forksCount: 2113,
    starsGained: 3703,
    rank: 1,
  },
  {
    fullName: 'apple/container',
    url: 'https://github.com/apple/container',
    description:
      'A tool for creating and running Linux containers using lightweight virtual machines on a Mac.',
    language: 'Swift',
    totalStars: 41719,
    forksCount: 1219,
    starsGained: 1746,
    rank: 2,
  },
  {
    fullName: 'ZhuLinsen/daily_stock_analysis',
    url: 'https://github.com/ZhuLinsen/daily_stock_analysis',
    description:
      'LLM-powered multi-market stock analysis system with real-time news, dashboards and automated notifications.',
    language: 'Python',
    totalStars: 48213,
    forksCount: 42906,
    starsGained: 1461,
    rank: 3,
  },
  {
    fullName: 'interviewstreet/hiring-agent',
    url: 'https://github.com/interviewstreet/hiring-agent',
    description: 'AI agent to evaluate and score resumes.',
    language: 'Python',
    totalStars: 1977,
    forksCount: 580,
    starsGained: 152,
    rank: 4,
  },
];

export class FixtureGitHubTrendingPageClient implements GitHubTrendingPageClientPort {
  async listTrendingRepositories(
    query: GitHubTrendingPageQuery,
  ): Promise<readonly GitHubTrendingPageRepository[]> {
    const language = query.language?.toLocaleLowerCase('en-US');
    const repositories =
      language === undefined
        ? fixtureRepositories
        : fixtureRepositories.filter(
            (repository) =>
              repository.language?.toLocaleLowerCase('en-US') === language,
          );

    return repositories.slice(0, normalizeLimit(query.limit));
  }
}

const normalizeLimit = (limit: number): number =>
  Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 25;
