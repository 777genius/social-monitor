import type { GitHubClientPort, GitHubIssueSearchPage, GitHubIssueSearchRequest } from './github-client.port';

const fixtureItems = [
  {
    id: 9001,
    nodeId: 'I_github_fixture_9001',
    htmlUrl: 'https://github.com/777genius/social-monitor/issues/1',
    title: 'Improve social monitoring scan reliability',
    body: 'Queue draining and provider certification should be visible in beta readiness.',
    userLogin: 'alice',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:30:00.000Z',
    state: 'open',
  },
  {
    id: 9002,
    nodeId: 'I_github_fixture_9002',
    htmlUrl: 'https://github.com/777genius/social-monitor/issues/2',
    title: 'Document GitHub source limitations',
    body: 'Public GitHub search is rate-limited and should remain cursor-safe.',
    userLogin: 'bob',
    createdAt: '2026-06-02T11:00:00.000Z',
    updatedAt: '2026-06-02T11:30:00.000Z',
    state: 'open',
  },
  {
    id: 9003,
    nodeId: 'PR_github_fixture_9003',
    htmlUrl: 'https://github.com/777genius/social-monitor/pull/3',
    title: 'Skip pull request fixture',
    body: 'Pull requests are intentionally skipped in the MVP issue-search provider.',
    userLogin: 'carol',
    createdAt: '2026-06-03T12:00:00.000Z',
    updatedAt: '2026-06-03T12:30:00.000Z',
    state: 'open',
    isPullRequest: true,
  },
] as const;

export class FixtureGitHubClient implements GitHubClientPort {
  async searchIssues(request: GitHubIssueSearchRequest): Promise<GitHubIssueSearchPage> {
    const cursor = readCursor(request.cursor);
    const limit = Math.max(1, Math.min(request.limit, 100));
    const pageItems = fixtureItems.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < fixtureItems.length ? String(cursor + limit) : undefined;

    return {
      items: pageItems,
      nextCursor,
    };
  }
}

const readCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = Number(cursor);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};
