import type { SourceBindingProps } from '../../domain';
import { sourceBindingScanQuery } from './source-binding-scan-query';

const makeBinding = (
  overrides: Partial<Pick<SourceBindingProps, 'id' | 'providerKey' | 'config'>> = {},
): Pick<SourceBindingProps, 'id' | 'providerKey' | 'config'> => ({
  id: 'binding-1',
  providerKey: 'fake-source',
  config: {},
  ...overrides,
});

describe('sourceBindingScanQuery', () => {
  it('uses safe query fields for fake/search providers', () => {
    expect(sourceBindingScanQuery(makeBinding({
      config: { query: ' monitoring ' },
    }))).toEqual({ mode: 'search', query: 'monitoring' });
  });

  it('falls back to binding id without exposing protected config details', () => {
    expect(sourceBindingScanQuery(makeBinding({
      id: 'binding-without-query',
      config: {
        apiToken: {
          encrypted: true,
          algorithm: 'aes-256-gcm',
          keyId: 'local',
          iv: 'iv',
          ciphertext: 'ciphertext',
          authTag: 'tag',
        },
      },
    }))).toEqual({ mode: 'search', query: 'binding-without-query' });
  });

  it('maps Hacker News listing bindings to listing source queries', () => {
    expect(sourceBindingScanQuery(makeBinding({
      providerKey: 'hacker-news',
      config: { mode: 'listing', listing: 'top' },
    }))).toEqual({ mode: 'listing', query: 'top' });
  });

  it('maps RSS bindings to feed URL source queries', () => {
    expect(sourceBindingScanQuery(makeBinding({
      providerKey: 'rss',
      config: { feedUrl: 'https://example.test/feed.xml' },
    }))).toEqual({ mode: 'url', query: 'https://example.test/feed.xml' });
  });

  it('maps Reddit listing bindings without exposing credentials', () => {
    expect(sourceBindingScanQuery(makeBinding({
      providerKey: 'reddit',
      config: {
        mode: 'listing',
        subreddit: 'observability',
        accessToken: {
          encrypted: true,
          algorithm: 'aes-256-gcm',
          keyId: 'local',
          iv: 'iv',
          ciphertext: 'ciphertext',
          authTag: 'tag',
        },
      },
    }))).toEqual({ mode: 'listing', query: 'observability' });
  });

  it('maps GitHub search bindings without exposing optional credentials', () => {
    expect(sourceBindingScanQuery(makeBinding({
      providerKey: 'github',
      config: {
        mode: 'listing',
        query: 'social monitoring repo:777genius/social-monitor',
        accessToken: {
          encrypted: true,
          algorithm: 'aes-256-gcm',
          keyId: 'local',
          iv: 'iv',
          ciphertext: 'ciphertext',
          authTag: 'tag',
        },
      },
    }))).toEqual({ mode: 'search', query: 'social monitoring repo:777genius/social-monitor' });
  });
});
