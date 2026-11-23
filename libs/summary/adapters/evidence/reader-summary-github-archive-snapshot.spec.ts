import type { GitHubTrendingArchiveMetadata } from '@social-monitor/ingestion/domain';
import type {
  ReaderSummaryGitHubArchiveSnapshot,
  ReaderSummaryGitHubArchiveProvenance,
} from '../../domain/policies/reader-summary-github-archive-snapshot';
import type { ReaderSummaryGitHubProjectionItem } from '../../domain/policies/reader-summary-github-projection-audit-types';

// Detect a provider-side schema/union change in either direction at compile time.
const producerIsConsumer:
  GitHubTrendingArchiveMetadata extends ReaderSummaryGitHubArchiveSnapshot ? true : false = true;
const consumerIsProducer:
  ReaderSummaryGitHubArchiveSnapshot extends GitHubTrendingArchiveMetadata ? true : false = true;
const producerProvenanceIsConsumer:
  GitHubTrendingArchiveMetadata['archive'] extends ReaderSummaryGitHubArchiveProvenance ? true : false = true;
const consumerProvenanceIsProducer:
  ReaderSummaryGitHubArchiveProvenance extends GitHubTrendingArchiveMetadata['archive'] ? true : false = true;

describe('summary archived GitHub observation type boundary', () => {
  it('admits the same immutable archive object without modifying custody fields', () => {
    const record: GitHubTrendingArchiveMetadata = Object.freeze({
      kind: 'github_trending_page_repository',
      repository: Object.freeze({
        fullName: 'example/repo', url: 'https://github.com/example/repo',
        totalStars: 100, forksCount: 5, description: 'A sample', language: 'TypeScript',
      }),
      trending: Object.freeze({
        observationKind: 'archived', window: 'daily', source: 'github_trending_archive',
        rank: 1, originalArchiveRank: 1, starsGained: 7,
        snapshotContentHash: 'c'.repeat(64),
        scanJobId: null, fetchStartedAt: null, checkedAt: null,
      }),
      archive: Object.freeze({
        repository: 'example/archive', commit: 'a'.repeat(40), gitBlobSha1: 'b'.repeat(40),
        filePath: 'api/daily/all.json', fileSha256: 'd'.repeat(64),
        originalSourceUrl: 'https://github.com/trending?since=daily',
        serializedAt: '2026-07-10T12:00:00.000Z',
        committedAt: '2026-07-10T12:01:00.000Z',
        acquiredAt: '2026-10-13T00:00:00.000Z',
      }),
    });
    const original = JSON.stringify(record);
    const snapshot: ReaderSummaryGitHubArchiveSnapshot = record;
    const item: Pick<ReaderSummaryGitHubProjectionItem, 'archivedObservation'> = {
      archivedObservation: snapshot,
    };
    expect(item.archivedObservation).toBe(record);
    expect(JSON.stringify(record)).toBe(original);
    expect([producerIsConsumer, consumerIsProducer,
      producerProvenanceIsConsumer, consumerProvenanceIsProducer]).toEqual([
      true, true, true, true,
    ]);
  });
});
