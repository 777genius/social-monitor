import { normalizeAlgoliaHit } from './hacker-news-provider-mappers';
import { selectQueryMatchedHits } from './hacker-news-query-match';

describe('Hacker News Algolia provider mapping', () => {
  it('prefers comment text over root story text for comment hits', () => {
    const hit = {
      objectID: '2001',
      story_text: 'Older root story',
      comment_text: '<p>New discussion comment</p>',
    };

    expect(normalizeAlgoliaHit(hit, 'comment')).toEqual([
      expect.objectContaining({ kind: 'comment', id: 2001, text: 'New discussion comment' }),
    ]);
    expect(normalizeAlgoliaHit(hit, 'story')).toEqual([
      expect.objectContaining({ kind: 'story', text: 'Older root story' }),
    ]);
  });

  it('ignores null untrusted text without breaking query matching or mapping', () => {
    // The external JSON API can return null despite the optional string contract.
    const hit = {
      objectID: '2002', title: 'Relevant source',
      story_text: null as unknown as string,
      comment_text: null as unknown as string,
    };

    expect(selectQueryMatchedHits([hit], 'Relevant')).toEqual([hit]);
    expect(normalizeAlgoliaHit(hit, 'story')).toEqual([
      expect.objectContaining({ kind: 'story', id: 2002, title: 'Relevant source' }),
    ]);
    expect(normalizeAlgoliaHit(hit, 'story')[0]).not.toHaveProperty('text');
  });
});
