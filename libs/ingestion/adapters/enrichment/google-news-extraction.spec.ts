import { guardedContentGet } from '../http/guarded-content-http';
import { postGoogleNewsResolution } from './google-news-resolver-http';
import { HttpReadabilityArticleContentExtractor } from './http-readability-article-content-extractor';
import { GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION } from '../../domain/value-objects/google-news-article';

jest.mock('../http/guarded-content-http', () => ({ ...jest.requireActual('../http/guarded-content-http'), guardedContentGet: jest.fn() }));
jest.mock('./google-news-resolver-http', () => ({ postGoogleNewsResolution: jest.fn() }));
const wrapper = 'https://news.google.com/rss/articles/CBMi_example';
const publisher = 'https://publisher.test/report';
const signaturePage = { status: 200, headers: new Headers({ 'content-type': 'text/html' }), finalUrl: wrapper,
  body: '<div data-n-a-sg="fixture" data-n-a-ts="1793664000"></div>' };
const article = { status: 200, headers: new Headers({ 'content-type': 'text/html' }), finalUrl: publisher,
  body: `<article><h1>Field report</h1><p>${'A practical experiment with limitations and measured outcomes. '.repeat(20)}</p></article>` };

describe('Google wrapper extraction at the normal HTTP boundary', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(guardedContentGet).mockResolvedValueOnce(signaturePage).mockResolvedValueOnce(article);
    jest.mocked(postGoogleNewsResolution).mockResolvedValue({ status: 200, headers: new Headers(), finalUrl: wrapper,
      body: JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', publisher]), null, '0']]) });
  });

  it('binds the original wrapper and actual publisher article to the Google representation', async () => {
    const result = await new HttpReadabilityArticleContentExtractor().extract({ url: wrapper, correlationId: 'fixture' });
    expect(result).toMatchObject({ ok: true, sourceUrl: wrapper, finalUrl: publisher,
      extractionVersion: GOOGLE_NEWS_ARTICLE_REPRESENTATION_VERSION });
    expect(guardedContentGet).toHaveBeenCalledTimes(2);
    expect(jest.mocked(guardedContentGet).mock.calls[1]![0]).toMatchObject({ url: publisher, maxBytes: 1_500_000, maxRedirects: 3 });
  });

  it('spends one shared extraction deadline across resolver phases without fetching the publisher after exhaustion', async () => {
    jest.mocked(postGoogleNewsResolution).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
      return { status: 200, headers: new Headers(), finalUrl: wrapper,
        body: JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', publisher]), null, '0']]) };
    });
    await expect(new HttpReadabilityArticleContentExtractor().extract({ url: wrapper, correlationId: 'fixture',
      remainingBudgetMs: 200 })).rejects.toThrow('deadline');
    expect(guardedContentGet).toHaveBeenCalledTimes(1);
    expect(postGoogleNewsResolution).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsafe resolved URL before any publisher request', async () => {
    jest.mocked(postGoogleNewsResolution).mockResolvedValue({ status: 200, headers: new Headers(), finalUrl: wrapper,
      body: JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', 'http://127.0.0.1/private']), null, '0']]) });
    await expect(new HttpReadabilityArticleContentExtractor().extract({ url: wrapper, correlationId: 'fixture' })).rejects.toThrow('private');
    expect(guardedContentGet).toHaveBeenCalledTimes(1);
  });

  it('retains normal transient HTTP retry semantics and Retry-After from the resolver', async () => {
    jest.mocked(postGoogleNewsResolution).mockResolvedValue({ status: 429, headers: new Headers({ 'retry-after': '120' }),
      finalUrl: wrapper, body: '' });
    await expect(new HttpReadabilityArticleContentExtractor().extract({ url: wrapper, correlationId: 'fixture' }))
      .resolves.toMatchObject({ ok: false, sourceUrl: wrapper, reasonCode: 'google_resolver_http_429', retryable: true, retryAfter: '120' });
    expect(guardedContentGet).toHaveBeenCalledTimes(1);
  });

  it('labels unavailable signatures and invalid RPC responses without relabeling the source URL invalid', async () => {
    jest.mocked(guardedContentGet).mockReset().mockResolvedValue({ ...signaturePage, body: '<div>No signature</div>' });
    const extractor = new HttpReadabilityArticleContentExtractor();
    await expect(extractor.extract({ url: wrapper, correlationId: 'fixture' })).resolves.toMatchObject({
      ok: false, sourceUrl: wrapper, reasonCode: 'google_resolver_unavailable', retryable: false,
    });
    expect(postGoogleNewsResolution).not.toHaveBeenCalled();
    jest.mocked(guardedContentGet).mockResolvedValue(signaturePage);
    jest.mocked(postGoogleNewsResolution).mockResolvedValue({ status: 200, headers: new Headers(), finalUrl: wrapper, body: '[]' });
    await expect(extractor.extract({ url: wrapper, correlationId: 'fixture' })).resolves.toMatchObject({
      ok: false, sourceUrl: wrapper, reasonCode: 'google_resolver_invalid_response', retryable: false,
    });
  });
});
