import { createHash } from 'node:crypto';
import type { JsonObject } from '@social-monitor/shared-kernel';
import {
  assertGitHubTrendingSnapshotBatchIntegrity, parseGitHubTrendingPageRepositoryMetadata,
} from '../../../domain/value-objects/github-trending-page';
import { parseGitHubTrendingArchiveMetadata } from '../../../domain/value-objects/github-trending-archive';
import { normalizeGitHubTrendingArchivedBoard } from './github-trending-archive-normalizer';

const fixture = () => {
  const bytes = Buffer.from(JSON.stringify({ pubDate: 'Fri, 09 Oct 2026 08:18:47 GMT', items: [
    { url: 'https://github.com/example/first', description: 'First tool', language: 'TypeScript',
      stars: 120, forks: 2, added_stars: '20 stars today' },
    { url: 'https://github.com/example/second', description: 'Second tool', language: 'Python',
      stars: 180, forks: 3, added_stars: '30 stars today' },
  ] }));
  return { bytes, archive: {
    repository: 'example/trending-archive', commit: 'a'.repeat(40),
    gitBlobSha1: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    filePath: 'api/daily/all.json', fileSha256: createHash('sha256').update(bytes).digest('hex'),
    originalSourceUrl: 'https://github.com/trending?since=daily',
    serializedAt: '2026-10-09T08:18:47.000Z', committedAt: '2026-10-09T08:23:18.000Z',
    acquiredAt: '2026-10-13T01:00:00.000Z',
  } };
};

const candidates = () => {
  const input = fixture();
  return normalizeGitHubTrendingArchivedBoard(input).map(item => ({
    ...item, ingestedAt: new Date(input.archive.acquiredAt),
  }));
};

describe('authentic archived GitHub observation contract', () => {
  it('preserves original archive publication and unknown fetch timestamps separately from acquisition', () => {
    const items = candidates();
    expect(items[0]?.canonicalUrl).toBe('https://github.com/example/second');
    const metadata = parseGitHubTrendingArchiveMetadata(items[0]?.metadata);
    expect(metadata?.trending).toMatchObject({ rank: 1, originalArchiveRank: 2,
      scanJobId: null, fetchStartedAt: null, checkedAt: null });
    expect(items[0]?.publishedAt.toISOString()).toBe('2026-10-09T08:18:47.000Z');
    expect(metadata?.archive.acquiredAt).toBe('2026-10-13T01:00:00.000Z');
    expect(parseGitHubTrendingPageRepositoryMetadata(items[0]?.metadata)).toBeNull();
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page', items })).not.toThrow();
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page',
      items: items.map(item => ({ ...item, ingestedAt: new Date('2026-10-13T01:01:00.000Z') })) })).not.toThrow();
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page',
      items: [{ ...items[0]!, ingestedAt: new Date('2026-10-13T00:59:59.000Z') }] })).toThrow();
    // Missing-only selection keeps original canonical rank rather than silently reranking.
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page', items: items.slice(1) })).not.toThrow();
  });

  it('rejects changed immutable bytes, blob custody, original day or a counterfeit live fetch', () => {
    const input = fixture();
    expect(() => normalizeGitHubTrendingArchivedBoard({ ...input, bytes: Buffer.concat([input.bytes, Buffer.from(' ')]) })).toThrow();
    expect(() => normalizeGitHubTrendingArchivedBoard({ ...input, archive: { ...input.archive, gitBlobSha1: 'b'.repeat(40) } })).toThrow();
    expect(() => normalizeGitHubTrendingArchivedBoard({ ...input, archive: { ...input.archive, committedAt: '2026-10-10T08:23:18.000Z' } })).toThrow();
    const items = candidates();
    const metadata = items[0]!.metadata!;
    const spoof: JsonObject = { ...metadata, trending: { ...(metadata.trending as JsonObject),
      fetchStartedAt: '2026-10-09T08:18:46.000Z' } };
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page',
      items: [{ ...items[0]!, metadata: spoof }] })).toThrow();
  });

  it('rejects duplicate archive repository rows instead of assigning a mismatched original rank', () => {
    const input = fixture();
    const board = JSON.parse(input.bytes.toString('utf8'));
    board.items.push({ ...board.items[0], added_stars: '99 stars today' });
    const bytes = Buffer.from(JSON.stringify(board));
    const archive = { ...input.archive,
      fileSha256: createHash('sha256').update(bytes).digest('hex'),
      gitBlobSha1: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    };
    expect(() => normalizeGitHubTrendingArchivedBoard({ bytes, archive })).toThrow('duplicate repository');
  });

  it('rejects mixed archive/live or mismatched envelope, identity, provider and publication time', () => {
    const items = candidates();
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'rss', items })).toThrow();
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page',
      items: [{ ...items[0]!, externalId: 'invented-original-scan' }] })).toThrow();
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page',
      items: [{ ...items[0]!, publishedAt: new Date('2026-10-13T01:00:00.000Z') }] })).toThrow();
    const changed = { ...items[1]!, metadata: { ...items[1]!.metadata!, archive: {
      ...(items[1]!.metadata!.archive as JsonObject), commit: 'b'.repeat(40),
    } } };
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page', items: [items[0]!, changed] })).toThrow();
    const live = { ...items[1]!, metadata: { ...items[1]!.metadata!, trending: {
      ...(items[1]!.metadata!.trending as JsonObject), observationKind: 'live',
    } } };
    expect(() => assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: 'github-trending-page', items: [items[0]!, live] })).toThrow();
  });
});
