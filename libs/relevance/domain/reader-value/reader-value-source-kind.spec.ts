import type { JsonObject } from '@social-monitor/shared-kernel';
import { classifyReaderValueSourceKind } from './reader-value-source-kind';

describe('reader-value source kind discovery', () => {
  it.each<[string, JsonObject]>([
    ['x-twitter', { kind: 'x_post', contentKind: 'original_post' }],
    ['twitter', { kind: 'twitter_post', contentKind: 'original_post' }],
    ['reddit', { kind: 'reddit_post' }],
    ['hn', { kind: 'hacker_news_story' }],
    ['rss', { kind: 'rss_item' }],
    ['github-repo-radar', { kind: 'github_repository_trend' }],
    ['github-trending-page', { kind: 'github_trending_page_repository' }],
  ])('discovers %s without engagement, legacy scores or semantic flags', (provider, metadata) => {
    const expected = classifyReaderValueSourceKind(provider, metadata);
    expect(expected.supported).toBe(true);
    expect(classifyReaderValueSourceKind(provider, {
      ...metadata, likes: null, score: 0, points: 0, qualityScore: 0,
      flags: ['promo_offer', 'needs_link_context'], topQualified: false,
    })).toEqual(expected);
  });

  it('keeps trending assessment separate from social Top eligibility', () => {
    expect(classifyReaderValueSourceKind('github-trending-page', { kind: 'github_trending_page_repository' }))
      .toEqual({ supported: true, kind: 'trending_repository', appendixOnly: true });
  });

  it.each<[string, JsonObject]>([
    ['unknown', { kind: 'rss_item' }], ['rss', {}], ['rss', { kind: 'reddit_post' }],
    ['reddit', { kind: 'reddit_comment' }], ['hn', { kind: 'hacker_news_comment' }],
    ['x', { kind: 'x_post', contentKind: 'reply' }],
    ['x', { kind: 'x_post', contentKind: 'quote' }],
    ['x', { kind: 'x_post' }],
    ['x', { kind: 'x_post', contentKind: 'original_post', postType: 'reply' }],
    ['hn', { kind: 'hacker_news_story', contentType: 'comment' }],
    ['github-repo-radar', { kind: 'github_repository_trend', type: 1 }],
  ])('reports unsupported identity/kind for %s without classifying it as noise', (provider, metadata) => {
    expect(classifyReaderValueSourceKind(provider, metadata)).toEqual({ supported: false, reason: 'unsupported_kind' });
  });
});
