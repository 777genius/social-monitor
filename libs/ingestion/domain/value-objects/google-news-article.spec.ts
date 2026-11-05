import type { JsonObject } from '@social-monitor/shared-kernel';
import { GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION, googleNewsArticleId } from './google-news-article';
import { ARTICLE_REPRESENTATION_VERSION, captureArticleText, captureNativeText, captureSha256, preserveSourceCapture, readContentCapture } from './source-content-capture';
import { articleCaptureIsDue, finishArticleCapture, prepareArticleCaptureAttempt, readArticleCaptureAttempt, reserveArticleCapture } from './article-capture-attempt';

const now = new Date('2026-11-03T00:00:00Z');
const url = 'https://news.google.com/rss/articles/CBMi_example?hl=en-US';
const raw = { title: 'Report', body: 'Feed description', canonicalUrl: url, metadata: { kind: 'rss_item' } };
const oldFailure = (patch: JsonObject = {}) => {
  const native = captureNativeText(raw, 'rss', now);
  const capture = readContentCapture(native)!;
  return { ...native, metadata: { ...native.metadata, articleCaptureAttempt: {
    version: 'article_capture_attempt.v1', nativeRevision: capture.nativeRevision, articleUrl: url,
    representationVersion: ARTICLE_REPRESENTATION_VERSION, status: 'permanent_failed', attemptCount: 1,
    nextAttemptAt: null, reasonCode: 'empty_extraction', reservationToken: null, scanJobId: null,
    scanFence: null, leaseUntil: null, ...patch,
  } } };
};

describe('Google News representation opportunities', () => {
  it.each(['rss/articles', 'articles', 'read'])('recognizes only the exact HTTPS wrapper %s', (path) => {
    expect(googleNewsArticleId(`https://news.google.com/${path}/CBMi_example?hl=en-US`)).toBe('CBMi_example');
  });

  it.each(['http://news.google.com/rss/articles/id', 'https://news.google.com:444/rss/articles/id',
    'https://news.google.com.evil.test/rss/articles/id', 'https://user:pass@news.google.com/rss/articles/id',
    'https://news.google.com/rss/articles/id/extra', 'https://news.google.com/rss/articles/%2fprivate'])('does not recognize %s', (value) => {
    expect(googleNewsArticleId(value)).toBeUndefined();
  });

  it('uses a new version only for fresh Google wrappers', () => {
    expect(readArticleCaptureAttempt(prepareArticleCaptureAttempt(captureNativeText(raw, 'rss', now), now)))
      .toMatchObject({ representationVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION, attemptCount: 0 });
    expect(ARTICLE_REPRESENTATION_VERSION).toBe('readability.text.v2');
  });

  it('retains the spent terminal attempt and advances 1→2 through normal prepare/reserve/complete', () => {
    const old = oldFailure();
    const before = JSON.stringify(old);
    const prepared = prepareArticleCaptureAttempt(old, now);
    expect(JSON.stringify(old)).toBe(before);
    expect(readContentCapture(prepared)).toEqual(readContentCapture(old));
    expect(readArticleCaptureAttempt(prepared)).toMatchObject({
      representationVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION, status: 'pending', attemptCount: 1,
      priorRepresentation: { representationVersion: 'readability.text.v2', status: 'permanent_failed',
        reasonCode: 'empty_extraction', attemptCount: 1, nextAttemptAt: null },
    });
    const reserved = reserveArticleCapture(prepared, { now, token: 'reservation', scanJobId: 'scan',
      scanFence: 'fence', leaseUntil: new Date(now.getTime() + 60_000) })!;
    expect(readArticleCaptureAttempt(reserved)?.attemptCount).toBe(2);
    const failedAgain = finishArticleCapture(reserved, { kind: 'permanent_failed', reasonCode: 'empty_extraction' }, now);
    expect(prepareArticleCaptureAttempt(failedAgain, now)).toBe(failedAgain);
    expect(readArticleCaptureAttempt(failedAgain)?.attemptCount).toBe(2);
    const text = 'The publisher article and its caveats.';
    const complete = finishArticleCapture(captureArticleText(reserved, {
      text, sourceUrl: url, finalUrl: 'https://publisher.test/report', originalLength: text.length,
      fullTextSha256: captureSha256(text), truncated: false,
      extractionVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION, acquiredAt: now,
    }), { kind: 'succeeded' }, now);
    const nextScan = preserveSourceCapture(captureNativeText(raw, 'rss', new Date(now.getTime() + 1000)), complete);
    expect(nextScan.body).toBe(complete.body);
    expect(readContentCapture(nextScan)?.article).toEqual(readContentCapture(complete)?.article);
    expect(readArticleCaptureAttempt(nextScan)).toEqual(readArticleCaptureAttempt(complete));
    expect(articleCaptureIsDue(nextScan, now)).toBe(false);
  });

  it.each<JsonObject>([
    { reasonCode: 'http_403' }, { reasonCode: 'network_or_timeout' }, { status: 'succeeded' },
    { attemptCount: 3 }, { attemptCount: 0 }, { attemptCount: -1 }, { attemptCount: 4 }, { attemptCount: 1.5 },
    { attemptCount: '1' }, { representationVersion: 'unknown.v9' }, { version: 'unknown.v9' },
    { leaseUntil: '2026-11-03T00:01:00Z' },
  ])('does not reopen unrelated, uncertain or exhausted terminal state %j', (patch) => {
    const old = oldFailure(patch);
    expect(prepareArticleCaptureAttempt(old, now)).toBe(old);
    expect(articleCaptureIsDue(old, now)).toBe(false);
  });

  it('does not reopen non-Google empty extraction failures', () => {
    const native = captureNativeText({ ...raw, canonicalUrl: 'https://publisher.test/report' }, 'rss', now);
    const old = oldFailure();
    const attempt = readArticleCaptureAttempt(old)!;
    const input = { ...native, metadata: { ...native.metadata, articleCaptureAttempt: { ...attempt,
      articleUrl: 'https://publisher.test/report', nativeRevision: readContentCapture(native)!.nativeRevision } } };
    expect(prepareArticleCaptureAttempt(input, now)).toBe(input);
  });

  it('advances nonterminal attempts only after their existing lease and backoff permit reservation', () => {
    const later = new Date(now.getTime() + 60_000);
    const running = oldFailure({ status: 'running', nextAttemptAt: later.toISOString(),
      reservationToken: 'old', scanJobId: 'old-scan', scanFence: 'old-fence', leaseUntil: later.toISOString() });
    expect(prepareArticleCaptureAttempt(running, now)).toBe(running);
    const liveLease = oldFailure({ status: 'running', nextAttemptAt: now.toISOString(), leaseUntil: later.toISOString() });
    expect(prepareArticleCaptureAttempt(liveLease, now)).toBe(liveLease);
    const backoff = oldFailure({ status: 'running', nextAttemptAt: later.toISOString(), leaseUntil: now.toISOString() });
    expect(prepareArticleCaptureAttempt(backoff, now)).toBe(backoff);
    const prepared = prepareArticleCaptureAttempt(running, later);
    expect(readArticleCaptureAttempt(prepared)).toMatchObject({ attemptCount: 1, status: 'pending',
      nextAttemptAt: later.toISOString(), priorRepresentation: { status: 'running', attemptCount: 1 } });
    expect(articleCaptureIsDue(prepared, later)).toBe(true);
    const retry = oldFailure({ status: 'retryable_failed', nextAttemptAt: later.toISOString() });
    expect(prepareArticleCaptureAttempt(retry, now)).toBe(retry);
    expect(readArticleCaptureAttempt(prepareArticleCaptureAttempt(retry, later))?.attemptCount).toBe(1);
  });
});
