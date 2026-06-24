import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { GITHUB_REPOSITORY_TREND_METADATA_KIND, parseGitHubRepositoryTrendMetadata } from '../../../domain';
import type { SourceProviderScanContext, SourceRuntimeConfig } from '../../../ports';
import type { GitHubRepoRadarCandidate, GitHubRepoRadarClientPort, GitHubRepoRadarQuery } from './github-repo-radar-client.port';
import type {
  GitHubRepositoryLiveRecord,
  GitHubRepositoryLiveVerificationRequest,
  GitHubRepositoryLiveVerifierPort,
} from './github-repository-live-verifier.port';
import { FixtureGitHubRepoRadarClient } from './fixture-github-repo-radar-client';
import { FixtureGitHubRepositoryLiveVerifier } from './fixture-github-repository-live-verifier';
import { GitHubRepoRadarSourceProvider } from './github-repo-radar-source.provider';
import { certifySourceProvider } from '../testing/source-provider-certification';

describe('GitHubRepoRadarSourceProvider', () => {
  certifySourceProvider({
    providerFactory: () => new GitHubRepoRadarSourceProvider(
      new FixtureGitHubRepoRadarClient(),
      new FixtureGitHubRepositoryLiveVerifier(),
      { now: () => new Date('2026-06-23T12:00:00.000Z') },
    ),
    validQuery: { mode: 'search', query: 'agents' },
    unsupportedQueryMode: 'listing',
    expectedProviderKey: 'github-repo-radar',
    expectedFailureKind: 'unavailable',
  });

  it('returns structured GitHub repository trend metadata for summary and feed cards', async () => {
    const provider = new GitHubRepoRadarSourceProvider(
      new FixtureGitHubRepoRadarClient(),
      new FixtureGitHubRepositoryLiveVerifier(),
      { now: () => new Date('2026-06-23T12:00:00.000Z') },
    );
    const result = await provider.scan(
      provider.planScan({ mode: 'search', query: 'agents' }, context({
        topics: ['ai', 'agents'],
        languages: ['TypeScript'],
        maxItems: 1,
        fixtureMode: true,
      })),
      context({
        topics: ['ai', 'agents'],
        languages: ['TypeScript'],
        maxItems: 1,
        fixtureMode: true,
      }),
    );

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('2026-06-23T12:00:00.000Z');
    expect(result.items[0]?.metadata).toMatchObject({
      kind: GITHUB_REPOSITORY_TREND_METADATA_KIND,
      repository: {
        fullName: 'openai/codex',
        language: 'TypeScript',
      },
      trend: {
        stars24h: 210,
        stars48h: 360,
        stars7d: 1200,
        source: 'fixture_gh_archive_plus_github_live',
      },
    });
    expect(parseGitHubRepositoryTrendMetadata(result.items[0]?.metadata)).toEqual(
      expect.objectContaining({
        repository: expect.objectContaining({ fullName: 'openai/codex' }),
        trend: expect.objectContaining({ primaryWindow: '24h' }),
      }),
    );
  });

  it('filters archived, forked, low-star and wrong-language repositories after live verification', async () => {
    const provider = new GitHubRepoRadarSourceProvider(
      new StaticRadarClient([
        candidate('acme/archived', 1),
        candidate('acme/fork', 2),
        candidate('acme/small', 3),
        candidate('acme/python-only', 4),
        candidate('acme/good', 5),
      ]),
      new StaticLiveVerifier(new Map([
        ['acme/archived', liveRepo('acme/archived', { archived: true, totalStars: 1000, language: 'TypeScript' })],
        ['acme/fork', liveRepo('acme/fork', { fork: true, totalStars: 1000, language: 'TypeScript' })],
        ['acme/small', liveRepo('acme/small', { totalStars: 5, language: 'TypeScript' })],
        ['acme/python-only', liveRepo('acme/python-only', { totalStars: 1000, language: 'Python' })],
        ['acme/good', liveRepo('acme/good', { totalStars: 1000, language: 'TypeScript' })],
      ])),
      { now: () => new Date('2026-06-23T12:00:00.000Z') },
    );

    const scanContext = context({
      languages: ['TypeScript'],
      minStars: 100,
      maxItems: 5,
      maxCandidates: 5,
    });
    const result = await provider.scan(
      provider.planScan({ mode: 'search', query: 'acme' }, scanContext),
      scanContext,
    );

    expect(result.items.map((item) => item.canonicalUrl)).toEqual(['https://github.com/acme/good']);
  });
});

const context = (config: SourceRuntimeConfig = {}): SourceProviderScanContext => ({
  tenantId: tenantId('tenant-repo-radar'),
  workspaceId: workspaceId('workspace-repo-radar'),
  sourceBindingId: 'binding-repo-radar',
  scanJobId: 'scan-repo-radar',
  correlationId: 'correlation-repo-radar',
  config,
});

const candidate = (fullName: string, rank: number): GitHubRepoRadarCandidate => ({
  fullName,
  stars24h: 100,
  stars48h: 150,
  stars7d: 200,
  stars30d: 300,
  stars90d: 400,
  rank,
  primaryWindow: '24h',
});

class StaticRadarClient implements GitHubRepoRadarClientPort {
  constructor(private readonly candidates: readonly GitHubRepoRadarCandidate[]) {}

  async findTrendingRepositories(query: GitHubRepoRadarQuery): Promise<readonly GitHubRepoRadarCandidate[]> {
    return this.candidates.slice(0, query.limit);
  }
}

class StaticLiveVerifier implements GitHubRepositoryLiveVerifierPort {
  constructor(private readonly repositories: ReadonlyMap<string, GitHubRepositoryLiveRecord>) {}

  async verifyRepository(
    request: GitHubRepositoryLiveVerificationRequest,
  ): Promise<GitHubRepositoryLiveRecord | null> {
    return this.repositories.get(request.fullName) ?? null;
  }
}

const liveRepo = (
  fullName: string,
  overrides: Partial<GitHubRepositoryLiveRecord> = {},
): GitHubRepositoryLiveRecord => ({
  fullName,
  url: `https://github.com/${fullName}`,
  description: `${fullName} description`,
  language: 'TypeScript',
  topics: ['ai', 'agents'],
  license: 'MIT',
  totalStars: 1000,
  forksCount: 100,
  fork: false,
  archived: false,
  ...overrides,
});
