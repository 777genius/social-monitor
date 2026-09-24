import { captureArticleText, captureNativeText, captureSha256, preserveSourceCapture, readContentCapture } from './source-content-capture';

const early = new Date('2026-09-20T00:00:00Z');
const later = new Date('2026-09-20T01:00:00Z');
const native = {
  title: 'HN report', body: 'Native caveat', canonicalUrl: 'https://news.ycombinator.com/item?id=1',
  metadata: { externalUrl: 'https://example.test/article' },
};
const rich = (text: string) => captureArticleText(captureNativeText(native, 'hacker-news', early), {
  text, sourceUrl: 'https://example.test/article', finalUrl: 'https://example.test/article',
  originalLength: text.length, fullTextSha256: captureSha256(text), truncated: false,
  extractionVersion: 'readability.text.v2', acquiredAt: later,
});

describe('source capture contract for checkpoint 1/2', () => {
  it('A10 preserves enriched text and earliest proven availability on a native-only scan', () => {
    const first = rich('Article detail.');
    const second = preserveSourceCapture(captureNativeText(native, 'hacker-news', later), first);
    expect(second.body).toBe(first.body);
    expect(readContentCapture(second)).toEqual(readContentCapture(first));
    expect(second.canonicalUrl).toBe(native.canonicalUrl);
  });

  it('reuses the article with its original availability when native text changes, but not when URL changes', () => {
    const first = rich('Article detail.');
    const second = preserveSourceCapture(captureNativeText({ ...native, body: 'Updated caveat' }, 'hacker-news', later), first);
    expect(second.body).toContain('Updated caveat');
    expect(second.body).toContain('Article detail.');
    expect(readContentCapture(second)?.article?.availableAt).toBe(later.toISOString());
    expect(readContentCapture(second)?.nativeRevision).not.toBe(readContentCapture(first)?.nativeRevision);
    const moved = preserveSourceCapture(captureNativeText({ ...native,
      metadata: { externalUrl: 'https://example.test/new' } }, 'hacker-news', later), first);
    expect(moved.body).toBe(native.body);
    expect(readContentCapture(moved)?.article).toBeUndefined();
  });

  it('A12 preserves late qualifications and explicit native/article boundaries for a 40k article', () => {
    const text = 'Details. '.repeat(4500) + 'Qualification: not a controlled trial.';
    const item = rich(text);
    const capture = readContentCapture(item)!;
    expect(capture.presentationComplete).toBe(true);
    expect(item.body.slice(capture.native.offset, capture.native.length)).toBe(native.body);
    expect(item.body.slice(capture.article!.offset)).toBe(text);
    expect(capture.availableAt).toBe(later.toISOString());
  });

  it('rejects malformed capture metadata and text changed without its bound digest', () => {
    const item = rich('Article detail.');
    expect(readContentCapture({ ...item, body: item.body + 'alteration' })).toBeUndefined();
    expect(readContentCapture({ ...native, metadata: { contentCapture: {
      version: 'source_content_capture.v1', native: null,
    } } })).toBeUndefined();
  });

  it('dates a changed title as new native content even when its body is unchanged', () => {
    const first = rich('Article detail.');
    const titleChanged = preserveSourceCapture(captureNativeText({ ...native, title: 'Corrected title' }, 'hacker-news', later), first);
    expect(readContentCapture(titleChanged)?.native.availableAt).toBe(later.toISOString());
    expect(readContentCapture(titleChanged)?.nativeRevision).not.toBe(readContentCapture(first)?.nativeRevision);
  });

  it('A13 marks storage truncation and over-envelope presentation honestly', () => {
    const item = captureNativeText({ ...native, body: 'x'.repeat(256_000) + '🙂' }, 'hacker-news', early);
    expect(item.body.length).toBe(256_000);
    expect(readContentCapture(item)?.native).toMatchObject({ originalLength: 256_002, truncated: true });
    expect(readContentCapture(item)?.presentationComplete).toBe(false);
    expect(readContentCapture(rich('x'.repeat(64_000)))?.presentationComplete).toBe(false);
  });

  it('does not put fetch time or engagement into the effective digest; meaningful tail changes do change it', () => {
    const first = rich('x'.repeat(40_000) + 'yes');
    const second = rich('x'.repeat(40_000) + 'no');
    expect(readContentCapture(first)?.sourceSnapshotSha256).not.toBe(readContentCapture(second)?.sourceSnapshotSha256);
    const refreshed = captureNativeText({ ...native, metadata: { ...native.metadata, score: 900 } }, 'hacker-news', later);
    expect(readContentCapture(preserveSourceCapture(refreshed, first))?.sourceSnapshotSha256)
      .toBe(readContentCapture(first)?.sourceSnapshotSha256);
  });
});
