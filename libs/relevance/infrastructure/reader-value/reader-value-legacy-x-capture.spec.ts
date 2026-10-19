import { readReaderValueCapture } from './reader-value-capture';
import { sha256 } from './reader-value-source-snapshot';

function legacyFixture() {
  const body = 'a'.repeat(92) + '\u{1F600}' + 'b'.repeat(10);
  const canonicalUrl = 'https://x.com/synthetic/status/123';
  const legacyTitle = `X post by @synthetic: ${body.slice(0, 93)}...`;
  const native = { origin: 'provider_native', offset: 0, length: body.length, originalLength: body.length,
    fullTextSha256: sha256(body), truncated: false, sourceUrl: canonicalUrl, finalUrl: canonicalUrl,
    extractionVersion: 'provider_native.v1', availableAt: '2026-10-18T01:00:00.123456Z' };
  const metadata = { kind: 'x_post', authorHandle: 'synthetic', contentCapture: {
    version: 'source_content_capture.v1', native, articleUrl: null,
    nativeRevision: sha256(JSON.stringify([legacyTitle, native.fullTextSha256, canonicalUrl, null])),
    sourceSnapshotSha256: sha256(JSON.stringify(['source_content_capture.v1', legacyTitle, body, null,
      JSON.stringify([native.origin, native.offset, native.length, native.originalLength, native.fullTextSha256,
        native.truncated, native.sourceUrl, native.finalUrl, native.extractionVersion])])),
  } };
  return { body, title: Buffer.from(legacyTitle, 'utf8').toString('utf8'), metadata, canonicalUrl,
    providerKey: 'x-twitter' };
}
type Fixture = ReturnType<typeof legacyFixture>;
const read = (fixture: Fixture) => readReaderValueCapture(fixture.metadata, fixture.providerKey,
  fixture.title, fixture.body, { sourceItemId: 'synthetic-source', canonicalUrl: fixture.canonicalUrl });

describe('verified legacy X UTF-16 capture compatibility', () => {
  it('reads the exact old producer capture without rewriting metadata, title, body or acquisition time', () => {
    const fixture = legacyFixture(), before = JSON.stringify(fixture);
    expect(read(fixture)).toMatchObject({ availableAt: '2026-10-18T01:00:00.123456Z',
      capture: { representationVersion: 'source_content_capture.v1', segments: [{
        offset: 0, length: fixture.body.length, fullTextSha256: sha256(fixture.body), truncated: false,
      }] } });
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it.each<[string, (fixture: Fixture) => void]>([
    ['body', (f) => { f.body += 'changed'; }],
    ['title', (f) => { f.title += 'changed'; }],
    ['snapshot digest', (f) => { f.metadata.contentCapture.sourceSnapshotSha256 = '0'.repeat(64); }],
    ['native revision', (f) => { f.metadata.contentCapture.nativeRevision = '0'.repeat(64); }],
    ['provider', (f) => { f.providerKey = 'rss'; }],
    ['kind', (f) => { f.metadata.kind = 'article'; }],
    ['author', (f) => { f.metadata.authorHandle = 'other'; }],
    ['canonical URL', (f) => { f.canonicalUrl += '/other'; }],
    ['body hash', (f) => { f.metadata.contentCapture.native.fullTextSha256 = '0'.repeat(64); }],
    ['offset', (f) => { f.metadata.contentCapture.native.offset = 1; }],
    ['length', (f) => { f.metadata.contentCapture.native.length -= 1; }],
    ['original length', (f) => { f.metadata.contentCapture.native.originalLength += 1; }],
    ['truncation', (f) => { f.metadata.contentCapture.native.truncated = true; }],
    ['native URL', (f) => { f.metadata.contentCapture.native.sourceUrl += '/other'; }],
    ['final URL', (f) => { f.metadata.contentCapture.native.finalUrl += '/other'; }],
    ['extraction version', (f) => { f.metadata.contentCapture.native.extractionVersion = 'provider_native.partial.v1'; }],
    ['article URL', (f) => { Object.assign(f.metadata.contentCapture, { articleUrl: 'https://example.test/article' }); }],
    ['article segment', (f) => { Object.assign(f.metadata.contentCapture, { article: { ...f.metadata.contentCapture.native, origin: 'linked_article' } }); }],
    ['availability', (f) => { f.metadata.contentCapture.native.availableAt = 'invalid'; }],
  ])('rejects %s tampering', (_label, mutate) => {
    const fixture = legacyFixture(); mutate(fixture);
    expect(read(fixture).availableAt).toBeNull();
  });

  it('requires the persisted canonical source identity', () => {
    const fixture = legacyFixture();
    expect(readReaderValueCapture(fixture.metadata, fixture.providerKey, fixture.title, fixture.body).availableAt).toBeNull();
  });

  it('does not treat an arbitrary replacement character as proof of the old surrogate cut', () => {
    const fixture = legacyFixture();
    fixture.body = fixture.body.replace('\u{1F600}', '\uFFFDx');
    fixture.metadata.contentCapture.native.fullTextSha256 = sha256(fixture.body);
    expect(read(fixture).availableAt).toBeNull();
  });
});
