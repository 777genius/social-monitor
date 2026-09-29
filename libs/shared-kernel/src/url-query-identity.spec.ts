import { identityQueryEntries, publicCanonicalUrlIdentity } from './url-query-identity';

describe('public URL identity', () => {
  it('removes synthetic credential parameters from direct and prefixed URLs', () => {
    const raw = 'https://example.test/article?edition=2&access_token=synthetic-marker-only';
    expect(publicCanonicalUrlIdentity(raw)).toBe('https://example.test/article?edition=2');
    expect(publicCanonicalUrlIdentity(`url:${raw}`)).toBe('url:https://example.test/article?edition=2');
  });

  it('sanitizes recognized redirect destinations and whitespace in public identities', () => {
    const destination = 'https://example.test/article?edition=2&access_token=synthetic-marker-only';
    const redirect = `https://www.google.com/url?q=${encodeURIComponent(destination)}&sa=U`;
    const safe = `https://www.google.com/url?q=${encodeURIComponent('https://example.test/article?edition=2')}&sa=U`;
    expect(publicCanonicalUrlIdentity(`  ${redirect}`)).toBe(safe);
    expect(publicCanonicalUrlIdentity(`url:  ${redirect}`)).toBe(`url:${safe}`);
    expect(publicCanonicalUrlIdentity(`  ${destination}`)).toBe('https://example.test/article?edition=2');
    expect(publicCanonicalUrlIdentity('https://example.test/article?edition=2'))
      .toBe('https://example.test/article?edition=2');
    // The policy also handles URLs shaped like capture segment sourceUrl/finalUrl.
    const segmentUrl = `https://www.google.com/url?url=${encodeURIComponent(destination)}`;
    expect(publicCanonicalUrlIdentity(segmentUrl)).not.toContain('synthetic-marker-only');
  });

  it.each([
    ['scheme without slashes', 'https:example.test/article?edition=2&access_token=synthetic-marker-only',
      'https://example.test/article?edition=2'],
    ['tab in scheme', 'hTTps:\t//example.test/article?edition=2&access_token=synthetic-marker-only',
      'https://example.test/article?edition=2'],
    ['leading NUL before redirect', `\u0000https://www.google.com/url?q=${encodeURIComponent(
      'https://example.test/article?edition=2&access_token=synthetic-marker-only')}&sa=U`,
    `https://www.google.com/url?q=${encodeURIComponent('https://example.test/article?edition=2')}&sa=U`],
  ])('sanitizes parser-accepted %s spelling', (_kind, raw, safe) => {
    expect(publicCanonicalUrlIdentity(raw)).toBe(safe);
    expect(publicCanonicalUrlIdentity(`url:${raw}`)).toBe(`url:${safe}`);
  });

  it('drops malformed URL-shaped identities and retains non-URL story identities', () => {
    expect(publicCanonicalUrlIdentity('https://?access_token=synthetic-marker-only')).toBe('');
    expect(publicCanonicalUrlIdentity('story:release-2')).toBe('story:release-2');
  });

  it('bounds redirect traversal and discards ambiguous destinations', () => {
    const marker = 'synthetic-marker-only';
    const target = `https://example.test/article?access_token=${marker}`;
    const doubleEncoded = `https://www.google.com/url?q=${encodeURIComponent(
      `https://example.test/article%3Faccess_token%3D${marker}`)}`;
    expect(publicCanonicalUrlIdentity(doubleEncoded)).toBe('https://www.google.com/url');
    expect(publicCanonicalUrlIdentity('https://www.google.com/url?q=javascript%3Aalert(1)&sa=U'))
      .toBe('https://www.google.com/url?sa=U');
    const nested = Array.from({ length: 4 }).reduce((url) =>
      `https://www.google.com/url?q=${encodeURIComponent(url)}`, target);
    expect(publicCanonicalUrlIdentity(nested)).not.toContain(marker);
    const unrelated = `https://example.test/url?q=${encodeURIComponent(target)}`;
    expect(publicCanonicalUrlIdentity(unrelated)).toBe(unrelated);
  });

  it('normalizes an accepted destination spelling inside a known redirect', () => {
    const destination = 'https:example.test/article?edition=2&access_token=synthetic-marker-only';
    const redirect = `https://www.google.com/url?q=${encodeURIComponent(destination)}&sa=U`;
    const safe = `https://www.google.com/url?q=${encodeURIComponent('https://example.test/article?edition=2')}&sa=U`;
    expect(publicCanonicalUrlIdentity(redirect)).toBe(safe);
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
