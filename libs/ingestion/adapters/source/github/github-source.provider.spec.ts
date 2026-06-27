import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { certifySourceProvider } from '../testing/source-provider-certification';
import type { GitHubClientPort, GitHubIssueSearchPage } from './github-client.port';
import { FixtureGitHubClient } from './fixture-github-client';
import { GITHUB_ISSUES_PROVIDER_KEY, GitHubSourceProvider } from './github-source.provider';

describe('GitHubSourceProvider', () => {
  certifySourceProvider({
    providerFactory: () => new GitHubSourceProvider(new FixtureGitHubClient()),
    validQuery: {
      mode: 'search',
      query: 'social monitoring repo:777genius/social-monitor',
    },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: GITHUB_ISSUES_PROVIDER_KEY,
    expectedFailureKind: 'unavailable',
  });

  it('skips readable issues without a valid timestamp', async () => {
    const provider = new GitHubSourceProvider(new StaticGitHubClient({
      items: [
        {
          id: 9101,
          nodeId: 'I_missing_timestamp',
          htmlUrl: 'https://github.com/777genius/social-monitor/issues/9101',
          title: 'Readable but missing GitHub timestamp',
          body: 'This issue must not be ingested with an epoch fallback.',
          userLogin: 'timestampless',
        },
        {
          id: 9102,
          nodeId: 'I_valid_timestamp',
          htmlUrl: 'https://github.com/777genius/social-monitor/issues/9102',
          title: 'Readable with GitHub timestamp',
          body: 'This issue is safe to ingest.',
          userLogin: 'timely',
          createdAt: '2026-06-05T10:06:00.000Z',
        },
      ],
    }));
    const context = {
      tenantId: tenantId('tenant-github-provider-test'),
      workspaceId: workspaceId('workspace-github-provider-test'),
      sourceBindingId: 'source-binding-github-provider-test',
      scanJobId: 'scan-job-github-provider-test',
      correlationId: 'correlation-github-provider-test',
    };
    const query = { mode: 'search' as const, query: 'repo:777genius/social-monitor is:issue' };

    const result = await provider.scan(provider.planScan(query, context), context);

    expect(result.items.map((item) => item.externalId)).toEqual(['github:I_valid_timestamp']);
    expect(result.items[0]?.publishedAt).toEqual(new Date('2026-06-05T10:06:00.000Z'));
    expect(result.warnings).toEqual([
      'Some GitHub issues search items had no valid timestamp; they were skipped.',
    ]);
  });
});

class StaticGitHubClient implements GitHubClientPort {
  constructor(private readonly page: GitHubIssueSearchPage) {}

  async searchIssues(): Promise<GitHubIssueSearchPage> {
    return this.page;
  }
}
