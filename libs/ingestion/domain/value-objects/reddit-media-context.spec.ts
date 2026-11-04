import type { JsonObject } from '@social-monitor/shared-kernel';
import { articleFetchUrl, captureNativeText, readContentCapture } from './source-content-capture';
import { articleCaptureIsDue, finishArticleCapture, prepareArticleCaptureAttempt, readArticleCaptureAttempt, reserveArticleCapture } from './article-capture-attempt';

const capturedAt = new Date('2026-11-03T00:00:00Z');
const post = (metadata: JsonObject) => ({
  title: 'A field experiment', body: 'The author describes the experiment.',
  canonicalUrl: 'https://www.reddit.com/r/science/comments/example/experiment/', metadata,
});

describe('Reddit article eligibility and uncaptured media', () => {
  it.each<JsonObject>([
    { linkedUrl: 'https://i.redd.it/example.jpg' },
    { linkedUrl: 'https://v.redd.it/example/DASH_720.mp4' },
    { linkedUrl: 'https://example.test/picture', postHint: 'image' },
    { linkedUrl: 'https://example.test/video', postHint: 'hosted:video' },
    { linkedUrl: 'https://example.test/watch', postHint: 'rich:video' },
    { linkedUrl: 'https://example.test/video', isVideo: true },
  ])('does not extract an article or assert complete media context for %j', (metadata) => {
    const item = post(metadata);
    expect(articleFetchUrl('reddit', item)).toBeUndefined();
    const captured = captureNativeText(item, 'reddit', capturedAt);
    expect(captured.body).toBe(item.body);
    expect(readContentCapture(captured)).toMatchObject({ articleUrl: null,
      presentationComplete: false, native: { extractionVersion: 'provider_native.partial.v1' } });
    expect(prepareArticleCaptureAttempt(captured, capturedAt)).toBe(captured);
    expect(articleCaptureIsDue(captured, capturedAt)).toBe(false);
  });

  it.each<JsonObject>([
    { linkedUrl: 'https://publisher.test/report', postHint: 'link', isVideo: false },
    { linkedUrl: 'https://publisher.test/report', thumbnailUrl: 'https://i.redd.it/preview.jpg' },
    { linkedUrl: 'https://i.redd.it.publisher.test/report' },
  ])('keeps genuine external articles eligible despite previews: %j', (metadata) => {
    const item = post(metadata);
    expect(articleFetchUrl('reddit', item)).toBe(metadata.linkedUrl);
    expect(readContentCapture(captureNativeText(item, 'reddit', capturedAt))?.articleUrl)
      .toBe(metadata.linkedUrl);
  });

  it('keeps self posts and other providers on their existing paths', () => {
    expect(articleFetchUrl('reddit', post({}))).toBeUndefined();
    expect(readContentCapture(captureNativeText(post({}), 'reddit', capturedAt))?.native.extractionVersion)
      .toBe('provider_native.v1');
    expect(articleFetchUrl('rss', { ...post({ isVideo: true }), canonicalUrl: 'https://publisher.test/report' }))
      .toBe('https://publisher.test/report');
  });

  it('does not rewrite an already captured record or its spent attempt', () => {
    const existing = captureNativeText(post({ linkedUrl: 'https://publisher.test/report' }), 'reddit', capturedAt);
    const pending = prepareArticleCaptureAttempt(existing, capturedAt);
    const running = reserveArticleCapture(pending, { now: capturedAt, token: 'reservation',
      scanJobId: 'scan', scanFence: 'fence', leaseUntil: new Date('2026-11-03T00:01:00Z') })!;
    const failed = finishArticleCapture(running, { kind: 'permanent_failed', reasonCode: 'http_403' }, capturedAt);
    const withAttempt = { ...failed, metadata: { ...failed.metadata, isVideo: true } };
    expect(captureNativeText(withAttempt, 'reddit', new Date('2026-11-04T00:00:00Z'))).toBe(withAttempt);
    expect(prepareArticleCaptureAttempt(withAttempt, capturedAt)).toBe(withAttempt);
    expect(readArticleCaptureAttempt(withAttempt)).toMatchObject({ status: 'permanent_failed', attemptCount: 1 });
    expect(articleCaptureIsDue(withAttempt, new Date('2026-11-04T00:00:00Z'))).toBe(false);
  });
});
