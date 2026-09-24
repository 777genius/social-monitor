import type { JsonObject } from '@social-monitor/shared-kernel';
import { articleCaptureCompletionMatches, articleCaptureIsDue, finishArticleCapture, prepareArticleCaptureAttempt, prepareLegacyArticleCapture, readArticleCaptureAttempt, reserveArticleCapture } from './article-capture-attempt';
import { captureNativeText, preserveSourceCapture, readContentCapture } from './source-content-capture';

const start = new Date('2026-09-20T00:00:00Z');
const source = (url = 'https://example.test/article') => captureNativeText({
  title: 'Story', body: 'Native text', canonicalUrl: 'https://news.ycombinator.com/item?id=1',
  metadata: { externalUrl: url },
}, 'hacker-news', start);
const reserve = (item: ReturnType<typeof source>, now: Date, token = 'attempt') => reserveArticleCapture(item, {
  now, token, scanJobId: 'scan', scanFence: 'fence', leaseUntil: new Date(now.getTime() + 30_000),
})!;

describe('durable article capture attempts', () => {
  it.each<JsonObject>([
    { status: 'failed' },
    { status: 'skipped', reason: 'scan item enrichment budget exceeded' },
    { status: 'skipped', reasonCode: 'noise_gate' },
  ])('recovers explicit unfinished legacy capture %j without spending an attempt', (articleContent) => {
    const item = { title: 'Story', body: 'Native text', canonicalUrl: 'https://example.test/article', metadata: { articleContent } };
    const prepared = prepareLegacyArticleCapture(item, 'rss', start);
    expect(prepared.body).toBe(item.body);
    expect(articleCaptureIsDue(prepared, start)).toBe(true);
    expect(readArticleCaptureAttempt(prepared)?.attemptCount).toBe(0);
  });

  it('does not turn historical successes or unrelated skips into a backfill', () => {
    for (const status of ['enriched', 'skipped']) {
      const item = { title: 'Story', body: 'Existing text', canonicalUrl: 'https://example.test/article', metadata: { articleContent: { status } } };
      expect(prepareLegacyArticleCapture(item, 'rss', start)).toBe(item);
    }
  });

  it('keeps budget skips pending without spending attempts or changing the source digest', () => {
    const item = prepareArticleCaptureAttempt(source(), start);
    const again = prepareArticleCaptureAttempt(item, new Date(start.getTime() + 1000));
    expect(readArticleCaptureAttempt(again)?.attemptCount).toBe(0);
    expect(articleCaptureIsDue(again, start)).toBe(true);
    expect(readContentCapture(again)?.sourceSnapshotSha256).toBe(readContentCapture(source())?.sourceSnapshotSha256);
  });

  it('reserves before dispatch, backs off 1/5 minutes and exhausts after three attempts', () => {
    let now = start;
    let item = prepareArticleCaptureAttempt(source(), now);
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      item = reserve(item, now, `attempt-${ordinal}`);
      expect(readArticleCaptureAttempt(item)?.attemptCount).toBe(ordinal);
      expect(articleCaptureIsDue(item, now)).toBe(false);
      item = finishArticleCapture(item, { kind: 'retryable_failed', reasonCode: 'network' }, now);
      if (ordinal < 3) {
        const delay = ordinal === 1 ? 60_000 : 300_000;
        expect(articleCaptureIsDue(item, new Date(now.getTime() + delay - 1))).toBe(false);
        now = new Date(now.getTime() + delay);
        expect(articleCaptureIsDue(item, now)).toBe(true);
      }
    }
    expect(readArticleCaptureAttempt(item)).toMatchObject({ status: 'permanent_failed', reasonCode: 'retry_exhausted', attemptCount: 3 });
  });

  it('rejects old URL/native and scan fence completions', () => {
    const item = reserve(prepareArticleCaptureAttempt(source(), start), start);
    const expected = readArticleCaptureAttempt(item)!;
    expect(articleCaptureCompletionMatches(item, expected, start)).toBe(true);
    expect(articleCaptureCompletionMatches(item, { ...expected, scanFence: 'old' }, start)).toBe(false);
    const changed = prepareArticleCaptureAttempt(preserveSourceCapture(source('https://example.test/new'), item), start);
    expect(articleCaptureCompletionMatches(changed, expected, start)).toBe(false);
    expect(readArticleCaptureAttempt(changed)?.attemptCount).toBe(0);
  });

  it('honors Retry-After beyond ordinary backoff and keeps native input available after failure', () => {
    const item = reserve(prepareArticleCaptureAttempt(source(), start), start);
    const retryAfter = new Date(start.getTime() + 3_600_000);
    const failed = finishArticleCapture(item, { kind: 'retryable_failed', reasonCode: 'rate_limited', retryAfter }, start);
    expect(articleCaptureIsDue(failed, new Date(retryAfter.getTime() - 1))).toBe(false);
    expect(articleCaptureIsDue(failed, retryAfter)).toBe(true);
    expect(failed.body).toBe('Native text');
  });
});
