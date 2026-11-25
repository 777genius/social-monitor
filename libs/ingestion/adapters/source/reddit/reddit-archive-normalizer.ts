import type { FetchedSourceItem } from '../../../ports/source-fetcher.port';
import { normalizePost, type RedditSourceQueryLaneMetadata } from './reddit-post-normalizer';

export type RedditArchiveProvenance = Readonly<{
  sourceUrl: string; acquiredAt: string; rawSha256: string; day: string;
}>;
const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Reddit archive object required');
  return value as Record<string, unknown>;
};
function need(value: unknown): asserts value { if (!value) throw new Error('Reddit archive evidence invalid'); }

/** No network or inferred live capture: archived removal absence stays unknown. */
export function normalizeRedditArchive(input: unknown, provenance: RedditArchiveProvenance,
  nativeIds: readonly string[], lane: RedditSourceQueryLaneMetadata, minScore: number | undefined): readonly FetchedSourceItem[] {
  const envelope = record(input), acquired = Date.parse(provenance.acquiredAt);
  need(Object.keys(provenance).sort().join(',') === ['sourceUrl','acquiredAt','rawSha256','day'].sort().join(','));
  need(Object.keys(envelope).length === 1 && Array.isArray(envelope.data));
  need(/^\d{4}-\d{2}-\d{2}$/u.test(provenance.day) && Number.isFinite(acquired) &&
    /^[a-f0-9]{64}$/u.test(provenance.rawSha256));
  const url = new URL(provenance.sourceUrl);
  need(url.protocol === 'https:' && url.hostname === 'arctic-shift.photon-reddit.com' &&
    url.pathname === '/api/posts/ids' && !url.username && !url.password && !url.hash);
  need(nativeIds.length > 0 && nativeIds.length <= 3 && new Set(nativeIds).size === nativeIds.length &&
    nativeIds.every(id => /^[a-z0-9]{4,12}$/u.test(id)));
  need([...url.searchParams.keys()].join(',') === 'ids' &&
    url.searchParams.get('ids')?.split(',').sort().join(',') === [...nativeIds].sort().join(','));
  need(lane.providerKey === 'reddit' && lane.mode === 'listing' && !!lane.subreddit &&
    lane.query.toLowerCase() === lane.subreddit.toLowerCase());
  need(envelope.data.length === nativeIds.length);
  const rows = envelope.data.map(record), seen = new Set<string>();
  return rows.flatMap(row => {
    const id = row.id, created = row.created_utc, retrieved = row.retrieved_on;
    need(typeof id === 'string' && nativeIds.includes(id) && !seen.has(id)); seen.add(id);
    need(typeof created === 'number' && Number.isSafeInteger(created) && typeof retrieved === 'number' &&
      Number.isSafeInteger(retrieved) && retrieved >= created && retrieved * 1000 <= acquired &&
      new Date(created * 1000).toISOString().slice(0, 10) === provenance.day);
    need(typeof row.subreddit === 'string' && row.subreddit.toLowerCase() === lane.subreddit!.toLowerCase());
    need(row.over_18 === false && Object.hasOwn(row, 'removed_by_category') && row.removed_by_category === null &&
      (!Object.hasOwn(row, 'removed') || row.removed === false));
    need(typeof row.score === 'number' && Number.isSafeInteger(row.score) &&
      typeof row.title === 'string' && typeof row.selftext === 'string' &&
      !['[removed]', '[deleted]'].includes(row.selftext.trim().toLowerCase()));
    need(row.name === undefined || row.name === `t3_${id}`);
    need(typeof row.permalink === 'string' && /^\/r\/[A-Za-z0-9_]+\/comments\/[a-z0-9]+(?:\/[^?#]*)?\/?$/u.test(row.permalink));
    need(row.permalink.split('/')[4] === id && row.permalink.split('/')[2]!.toLowerCase() === row.subreddit.toLowerCase());
    const items = normalizePost({ id, name: `t3_${id}`, subreddit: row.subreddit,
      title: row.title, selftext: row.selftext, createdUtc: created, over18: false, score: row.score,
      ...(typeof row.permalink === 'string' ? { permalink: row.permalink } : {}),
      ...(typeof row.url === 'string' ? { url: row.url } : {}),
    }, minScore, lane);
    need(items.length === 1); // A pinned import is all-or-nothing, never silently drops rejected rows.
    return items.map(item => ({ ...item, metadata: { ...item.metadata,
      redditArchive: { schemaVersion: 1, origin: 'arctic_shift', coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS',
        sourceUrl: provenance.sourceUrl, rawSha256: provenance.rawSha256, acquiredAt: provenance.acquiredAt,
        originalCreatedUtc: created, archiveRetrievedUtc: retrieved, over18: false,
        removedByCategory: null, removed: Object.hasOwn(row, 'removed') ? false : 'UNKNOWN_ABSENT',
        liveProviderChecked: 'UNKNOWN', originalCollectionAttempt: 'UNKNOWN' },
    } }));
  });
}
