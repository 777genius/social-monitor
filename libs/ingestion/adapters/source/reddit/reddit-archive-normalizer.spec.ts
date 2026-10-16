import { normalizeRedditArchive } from './reddit-archive-normalizer';

const id = 'test123', created = Date.parse('2026-10-04T12:00:00Z') / 1000;
const provenance = { sourceUrl: `https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${id}`,
  acquiredAt: '2026-10-15T09:20:31.716Z', rawSha256: 'a'.repeat(64), day: '2026-10-04' };
const lane = { providerKey: 'reddit' as const, mode: 'listing' as const, query: 'LocalLLaMA', subreddit: 'LocalLLaMA', listing: 'new' };
const row = () => ({ id, name: `t3_${id}`, subreddit: 'LocalLLaMA', title: 'Fixture public release', selftext: 'Fixture source text.',
  created_utc: created, retrieved_on: created + 10, score: 0, over_18: false, removed_by_category: null,
  permalink: `/r/LocalLLaMA/comments/${id}/fixture/` });
describe('Reddit archive provenance and canonical policy', () => {
  it('preserves zero score, original clock and unknown removal without fabricating live capture', () => {
    const item = normalizeRedditArchive({ data: [row()] }, provenance, [id], lane, 0)[0]!;
    expect(item.externalId).toBe(`reddit:t3_${id}`);
    expect(item.publishedAt?.toISOString()).toBe('2026-10-04T12:00:00.000Z');
    expect(item.metadata).toMatchObject({ kind: 'reddit_post', score: 0,
      redditArchive: { acquiredAt: provenance.acquiredAt, archiveRetrievedUtc: created + 10,
        removed: 'UNKNOWN_ABSENT', liveProviderChecked: 'UNKNOWN', originalCollectionAttempt: 'UNKNOWN' } });
    expect(item.metadata).not.toHaveProperty('contentCapture');
    expect(item.metadata).not.toHaveProperty('fetchedAt');
  });
  it.each([{ over_18: true }, { removed_by_category: 'moderator' }, { removed: true },
    { retrieved_on: created - 1 }, { created_utc: created + 86400 }, { score: -1 },
    { permalink: '/r/LocalLLaMA/comments/foreign/fixture/' }])('rejects unsafe or conflicting evidence %j', patch => {
    expect(() => normalizeRedditArchive({ data: [{ ...row(), ...patch }] }, provenance, [id], lane, 0)).toThrow();
  });
  it('refuses the whole pinned input when actual configured minimum rejects a row', () => {
    expect(() => normalizeRedditArchive({ data: [row()] }, provenance, [id], lane, 1)).toThrow();
  });
  it('rejects duplicate native identities and foreign requested IDs', () => {
    expect(() => normalizeRedditArchive({ data: [row(), row()] }, provenance, [id, id], lane, 0)).toThrow();
    expect(() => normalizeRedditArchive({ data: [row()] }, provenance, ['foreign'], lane, 0)).toThrow();
  });
});
