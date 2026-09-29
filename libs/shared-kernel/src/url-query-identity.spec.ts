import { identityQueryEntries, publicCanonicalUrlIdentity } from './url-query-identity';

describe('public URL identity', () => {
  it('removes synthetic credential parameters from direct and prefixed URLs', () => {
    const raw = 'https://example.test/article?edition=2&access_token=synthetic-marker-only';
    expect(publicCanonicalUrlIdentity(raw)).toBe('https://example.test/article?edition=2');
    expect(publicCanonicalUrlIdentity(`url:${raw}`)).toBe('url:https://example.test/article?edition=2');
  });

  it('keeps repeated identity values in order and scopes share parameters to their hosts', () => {
    const entries = (host: string, query: string) =>
      identityQueryEntries(host, new URLSearchParams(query));
    expect(entries('journal.example', 'lang=en&id=1&id=2')).toEqual([
      ['id', '1'], ['id', '2'], ['lang', 'en'],
    ]);
    expect(entries('journal.example', 'id=1&id=2')).not.toEqual(
      entries('journal.example', 'id=2&id=1'));
    expect(entries('x.com', 'ref_src=share&access_token=synthetic-marker-only'))
      .toEqual([]);
    expect(entries('journal.example', 'ref_src=edition')).toEqual([['ref_src', 'edition']]);
    expect(entries('youtu.be', 'si=share')).toEqual([]);
    expect(entries('journal.example', 'si=edition')).toEqual([['si', 'edition']]);
  });
});
