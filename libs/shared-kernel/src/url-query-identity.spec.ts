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

  it('sanitizes a recognized redirect host with a trailing DNS dot', () => {
    const raw = `https://www.google.com./url?q=${encodeURIComponent(
      'https://example.test/article?edition=2&access_token=synthetic-marker-only')}`;
    expect(publicCanonicalUrlIdentity(raw)).toBe(`https://www.google.com./url?q=${encodeURIComponent(
      'https://example.test/article?edition=2')}`);
  });

  it.each([
    ['encoded Google path', 'https://www.google.com./%75rl?q=', ''],
    ['Facebook redirect', 'https://l.facebook.com/l.php?u=', ''],
    ['LinkedIn redirect', 'https://www.linkedin.com/redir/redirect?url=', ''],
    ['DuckDuckGo redirect', 'https://duckduckgo.com/l/?uddg=', ''],
    ['unknown redirect', 'https://redirect.example.test/go?next=', ''],
  ])('removes nested credentials from %s while preserving harmless parameters',
    (_kind, prefix, suffix) => {
      const destination = 'https://example.test/article?edition=2&access_token=synthetic-marker-only';
      const safe = 'https://example.test/article?edition=2';
      const raw = `${prefix}${encodeURIComponent(destination)}${suffix}&lang=en`;
      const expected = `${prefix}${encodeURIComponent(safe)}${suffix}&lang=en`;
      expect(publicCanonicalUrlIdentity(raw)).toBe(expected);
      expect(publicCanonicalUrlIdentity(`url:${raw}`)).toBe(`url:${expected}`);
      expect(publicCanonicalUrlIdentity(raw)).not.toContain('synthetic-marker-only');
    });

  it('retains benign URL-valued and ordinary query values on unrelated hosts', () => {
    const raw = `https://example.test/article?edition=2&next=${encodeURIComponent(
      'https://elsewhere.test')}&q=hello%20world&discount=100%25`;
    expect(publicCanonicalUrlIdentity(raw)).toBe(raw);
    expect(identityQueryEntries('example.test', new URLSearchParams('next=https%3A%2F%2Felsewhere.test')))
      .toEqual([['next', 'https://elsewhere.test']]);
  });

  it('sanitizes a nested credential under an empty query name for public and story identities', () => {
    const raw = 'https://example.test/?=https%3A%2F%2Fexample.test%2F%3Faccess_token%3Dsynthetic-marker-only';
    const safe = 'https://example.test/?=https%3A%2F%2Fexample.test%2F';
    expect(publicCanonicalUrlIdentity(raw)).toBe(safe);
    expect(publicCanonicalUrlIdentity(`url:${raw}`)).toBe(`url:${safe}`);
    expect(identityQueryEntries('example.test', new URL(raw).searchParams)).toEqual(
      identityQueryEntries('example.test', new URL(safe).searchParams));
  });

  it('removes credentials in generic scheme-relative values and preserves benign ones', () => {
    const raw = 'https://example.test/article?next=%2F%2Fuser%3Asynthetic-marker-only%40elsewhere.test%2F';
    const safe = 'https://example.test/article?next=%2F%2Felsewhere.test%2F';
    expect(publicCanonicalUrlIdentity(raw)).toBe(safe);
    expect(publicCanonicalUrlIdentity(`url:${raw}`)).toBe(`url:${safe}`);
    expect(identityQueryEntries('example.test', new URL(raw).searchParams)).toEqual(
      identityQueryEntries('example.test', new URL(safe).searchParams));
    const benign = 'https://example.test/article?next=%2F%2Felsewhere.test%2Farticle';
    expect(publicCanonicalUrlIdentity(benign)).toBe(benign);
  });

  it('bounds oversized query identities without changing bounded query values', () => {
    // A blank, noncredential value is part of a bounded URL's identity.
    expect(identityQueryEntries('example.test', new URLSearchParams('edition=&lang=en')))
      .toEqual([['edition', ''], ['lang', 'en']]);
    const bounded = new URLSearchParams(Array.from({ length: 256 }, (_, index) =>
      [`p${index}`, `v${index}`]));
    expect(identityQueryEntries('example.test', bounded)).toHaveLength(256);
    bounded.append('access_token', 'synthetic-marker-only');
    expect(identityQueryEntries('example.test', bounded)).toEqual([]);
    const oversized = new URLSearchParams(Array.from({ length: 8000 }, (_, index) =>
      [`p${index}`, `v${index}`]));
    expect(identityQueryEntries('example.test', oversized)).toEqual([]);
    expect(publicCanonicalUrlIdentity(`https://example.test/?q=${'a'.repeat(16_384)}`))
      .toBe('');
  });

  it('handles redirect host aliases and mixed case without exposing the destination', () => {
    const raw = `HTTPS://WWW.LINKEDIN.COM./REDIR/REDIRECT?URL=${encodeURIComponent(
      'https://example.test/article?lang=en&access_token=synthetic-marker-only')}&lang=en`;
    const safe = publicCanonicalUrlIdentity(raw);
    expect(safe).toBe(`https://www.linkedin.com./REDIR/REDIRECT?URL=${encodeURIComponent(
      'https://example.test/article?lang=en')}&lang=en`);
    expect(safe).not.toContain('synthetic-marker-only');
  });

  it('drops credential-bearing URLs hidden in query names and fragments', () => {
    const target = 'https://example.test/article?access_token=synthetic-marker-only';
    const queryName = `https://example.test/article?${encodeURIComponent(target)}&lang=en`;
    const fragment = `https://example.test/article#${encodeURIComponent(target)}`;
    expect(publicCanonicalUrlIdentity(queryName)).toBe('https://example.test/article?lang=en');
    expect(publicCanonicalUrlIdentity(fragment)).toBe('https://example.test/article');
    expect(publicCanonicalUrlIdentity('https://example.test/article#section-2'))
      .toBe('https://example.test/article#section-2');
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
    const deeplyEncoded = Array.from({ length: 5 }).reduce<string>((value) =>
      encodeURIComponent(value), target);
    expect(publicCanonicalUrlIdentity(`https://example.test/go?next=${deeplyEncoded}`))
      .toBe('https://example.test/go');
    expect(publicCanonicalUrlIdentity('https://www.google.com/url?q=javascript%3Aalert(1)&sa=U'))
      .toBe('https://www.google.com/url?sa=U');
    const nested = Array.from({ length: 4 }).reduce<string>((url) =>
      `https://www.google.com/url?q=${encodeURIComponent(url)}`, target);
    expect(publicCanonicalUrlIdentity(nested)).not.toContain(marker);
    const unrelated = `https://example.test/url?q=${encodeURIComponent(target)}`;
    expect(publicCanonicalUrlIdentity(unrelated))
      .toBe('https://example.test/url?q=https%3A%2F%2Fexample.test%2Farticle');
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
    expect(entries('journal.example', 'sv=1&sig=synthetic-marker-only&edition=2'))
      .toEqual([['edition', '2']]);
    expect(entries('journal.example', 'expires=1&awsaccesskeyid=synthetic-marker-only&edition=2'))
      .toEqual([['edition', '2']]);
  });
});
