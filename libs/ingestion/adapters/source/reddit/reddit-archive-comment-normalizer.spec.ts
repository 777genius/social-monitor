import { normalizeRedditArchiveComments } from './reddit-archive-comment-normalizer';
import { commentResponse, archiveIdentity, archiveProvenance } from '../../../../../scripts/backfill/reddit-archive-write/comment-plan.spec-support';
import { planRedditArchiveComments } from '../../../../../scripts/backfill/reddit-archive-write/comment-plan';

describe('retained Reddit comment identity and chronology', () => {
  it('preserves both original UTC dates and explicit UNKNOWN without rankable safe metrics', () => {
    const units = normalizeRedditArchiveComments(commentResponse(), archiveProvenance, archiveIdentity);
    expect(units.map(unit => [unit.providerUnitId, unit.publishedAt.toISOString()])).toEqual([
      ['t1_pdhrwqg', '2026-10-02T21:22:01.000Z'], ['t1_pd5e1lp', '2026-10-01T04:51:00.000Z'],
    ]);
    for (const unit of units) {
      expect(unit.rootExternalId).toBe('reddit:t3_1wuktlf');
      expect(unit.metadata?.redditArchiveComments).toMatchObject({ rawSha256: archiveProvenance.rawSha256,
        acquiredAt: archiveProvenance.acquiredAt, removalReason: null, removedByCategory: 'UNKNOWN_ABSENT',
        deletionStatus: 'UNKNOWN', removalStatus: 'UNKNOWN', archiveScore: 1 });
      expect(unit.metadata).not.toHaveProperty('removed');
      expect(unit.metadata).not.toHaveProperty('providerScore');
      expect(unit).not.toHaveProperty('authorHandle');
    }
  });
  it.each([
    { id: 'other123' }, { name: 't3_pdhrwqg' }, { name: undefined },
    { link_id: 't3_foreign' }, { parent_id: 't1_reply' }, { root: 't3_foreign' },
    { subreddit: 'foreign' }, { created_utc: 1790830260 }, { retrieved_on: 1790976120 },
    { body: '' }, { body: '[removed]' }, { body: '[deleted]' },
    { removal_reason: 'removed' }, { removed_by_category: null }, { removed: false }, { deleted: false },
    { permalink: 'https://foreign.test/' }, { permalink: '/r/LocalLLaMA/comments/1wuktlf/x/foreign/' },
  ])('rejects malformed or changed retained observations (%j)', mutation => {
    const input = commentResponse(); Object.assign(input.data[0]!, mutation);
    expect(() => normalizeRedditArchiveComments(input, archiveProvenance, archiveIdentity)).toThrow();
  });
  it('refuses duplicate, substituted IDs, wrong URL/hash/acquisition and unbound raw bytes', () => {
    const input = commentResponse(); input.data[1] = input.data[0]!;
    expect(() => normalizeRedditArchiveComments(input, archiveProvenance, archiveIdentity)).toThrow();
    expect(() => normalizeRedditArchiveComments(commentResponse(), archiveProvenance,
      { ...archiveIdentity, nativeCommentIds: ['other123', 'pd5e1lp'] })).toThrow();
    for (const mutation of [{ sourceUrl: archiveProvenance.sourceUrl + '&x=1' },
      { rawSha256: 'a'.repeat(64) }, { acquiredAt: '2026-10-01T00:00:00.000Z' }]) {
      expect(() => normalizeRedditArchiveComments(commentResponse(), { ...archiveProvenance, ...mutation }, archiveIdentity)).toThrow();
    }
    expect(() => planRedditArchiveComments(Buffer.from(JSON.stringify(commentResponse())), Buffer.from('{}'))).toThrow();
  });
});
