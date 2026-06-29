import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceItem } from '../../../domain';
import { InMemoryGitHubRepositoryTrendHistoryRepository } from '../../persistence/in-memory-github-repository-trend-history.repository';
import { GitHubRepositoryTrendMetadataProjectionAdapter } from './github-repository-trend-metadata-projection.adapter';
import { githubRepositoryTrendMetadata } from '../../../domain';

describe('GitHubRepositoryTrendMetadataProjectionAdapter', () => {
  it('projects repository trend metadata into history records and ignores generic source items', async () => {
    const repository = new InMemoryGitHubRepositoryTrendHistoryRepository();
    const projection = new GitHubRepositoryTrendMetadataProjectionAdapter(repository);
    const result = await projection.project({
      tenantId: tenantId('tenant-trend-history'),
      workspaceId: workspaceId('workspace-trend-history'),
      interestId: '00000000-0000-7000-8000-000000000001',
      sourceBindingId: '00000000-0000-7000-8000-000000000002',
      scanJobId: '00000000-0000-7000-8000-000000000003',
      providerKey: 'github-repo-radar',
      sourceItems: [
        SourceItem.ingest({
          id: '00000000-0000-7000-8000-000000000004',
          tenantId: tenantId('tenant-trend-history'),
          workspaceId: workspaceId('workspace-trend-history'),
          sourceBindingId: '00000000-0000-7000-8000-000000000002',
          externalId: 'github-repo-radar:openai/codex:2026-06-23T12:00:00.000Z',
          canonicalUrl: 'https://github.com/openai/codex',
          title: 'openai/codex is trending on GitHub',
          body: 'AI coding agent CLI.',
          publishedAt: new Date('2026-06-23T12:00:00.000Z'),
          ingestedAt: new Date('2026-06-23T12:01:00.000Z'),
          metadata: githubRepositoryTrendMetadata({
            repository: {
              fullName: 'openai/codex',
              url: 'https://github.com/openai/codex',
              description: 'AI coding agent CLI.',
              language: 'TypeScript',
              topics: ['ai', 'agents'],
              license: 'Apache-2.0',
            },
            trend: {
              totalStars: 54000,
              stars24h: 210,
              stars48h: 360,
              stars7d: 1200,
              stars30d: 4800,
              stars90d: 11000,
              rank: 1,
              primaryWindow: '24h',
              checkedAt: new Date('2026-06-23T12:00:00.000Z'),
              source: 'fixture_gh_archive_plus_github_live',
            },
          }),
        }),
        SourceItem.ingest({
          id: '00000000-0000-7000-8000-000000000005',
          tenantId: tenantId('tenant-trend-history'),
          workspaceId: workspaceId('workspace-trend-history'),
          sourceBindingId: '00000000-0000-7000-8000-000000000002',
          externalId: 'generic-source-item',
          canonicalUrl: 'https://example.test/generic',
          title: 'Generic source item',
          body: 'No provider metadata.',
          publishedAt: new Date('2026-06-23T12:00:00.000Z'),
          ingestedAt: new Date('2026-06-23T12:01:00.000Z'),
        }),
      ],
    });

    expect(result).toEqual({ projected: 1 });
    expect(repository.all()).toEqual([
      expect.objectContaining({
        repositoryFullName: 'openai/codex',
        totalStars: 54000,
        stars24h: 210,
        stars48h: 360,
        primaryWindow: '24h',
        source: 'fixture_gh_archive_plus_github_live',
      }),
    ]);
  });
});
