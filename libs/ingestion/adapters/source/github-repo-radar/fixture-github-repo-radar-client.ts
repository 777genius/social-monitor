import type {
  GitHubRepoRadarCandidate,
  GitHubRepoRadarClientPort,
  GitHubRepoRadarQuery,
} from './github-repo-radar-client.port';

const fixtureCandidates: readonly GitHubRepoRadarCandidate[] = [
  {
    fullName: 'openai/codex',
    stars24h: 210,
    stars48h: 360,
    stars7d: 1200,
    stars30d: 4800,
    stars90d: 11000,
    rank: 1,
    primaryWindow: '24h',
  },
  {
    fullName: 'astral-sh/uv',
    stars24h: 430,
    stars48h: 700,
    stars7d: 2800,
    stars30d: 9400,
    stars90d: 21000,
    rank: 2,
    primaryWindow: '48h',
  },
  {
    fullName: 'flutter/flutter',
    stars24h: 40,
    stars48h: 70,
    stars7d: 300,
    stars30d: 1100,
    stars90d: 2600,
    rank: 3,
    primaryWindow: '48h',
  },
];

const fixtureCandidateSearchIndex = new Map<string, readonly string[]>([
  ['openai/codex', ['openai/codex', 'ai', 'agents', 'developer-tools', 'typescript']],
  ['astral-sh/uv', ['astral-sh/uv', 'python', 'rust', 'package-manager', 'devtools']],
  ['flutter/flutter', ['flutter/flutter', 'flutter', 'dart', 'mobile']],
]);

export class FixtureGitHubRepoRadarClient implements GitHubRepoRadarClientPort {
  async findTrendingRepositories(query: GitHubRepoRadarQuery): Promise<readonly GitHubRepoRadarCandidate[]> {
    const normalizedQuery = query.query.toLocaleLowerCase('en-US');
    const filtered = fixtureCandidates.filter((candidate) =>
      normalizedQuery.length === 0 ||
      matchesFixtureCandidate(candidate.fullName, normalizedQuery, query.topics, query.languages),
    );

    return filtered.slice(0, query.limit);
  }
}

const matchesFixtureCandidate = (
  fullName: string,
  normalizedQuery: string,
  topics: readonly string[],
  languages: readonly string[],
): boolean => {
  const searchIndex = fixtureCandidateSearchIndex.get(fullName) ?? [fullName];
  const normalizedTokens = searchIndex.map((token) => token.toLocaleLowerCase('en-US'));

  return normalizedTokens.some((token) => token.includes(normalizedQuery)) ||
    topics.some((topic) => normalizedTokens.includes(topic.toLocaleLowerCase('en-US'))) ||
    languages.some((language) => normalizedTokens.includes(language.toLocaleLowerCase('en-US')));
};
