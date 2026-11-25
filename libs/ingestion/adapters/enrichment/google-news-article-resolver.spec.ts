import { guardedContentGet } from '../http/guarded-content-http';
import { postGoogleNewsResolution } from './google-news-resolver-http';
import { parseGoogleNewsPublisher, resolveGoogleNewsArticle } from './google-news-article-resolver';

jest.mock('../http/guarded-content-http', () => ({ ...jest.requireActual('../http/guarded-content-http'), guardedContentGet: jest.fn() }));
jest.mock('./google-news-resolver-http', () => ({ postGoogleNewsResolution: jest.fn() }));

const wrapper = 'https://news.google.com/rss/articles/CBMi_example';
const publisher = 'https://publisher.test/report';
const rpc = (url = publisher, id: string | null = '0') => ['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', url]), null, id];
const reply = (rows: unknown[] = [rpc()]) => `)]}'\n\n${JSON.stringify(rows)}`;
const options = { remainingMs: () => 1000, maxBytes: 1_500_000, maxRedirects: 3, userAgent: 'fixture' };

describe('Google publisher resolution protocol', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(guardedContentGet).mockResolvedValue({ status: 200, headers: new Headers(), finalUrl: wrapper,
      body: '<div data-n-a-sg="fixture-signature" data-n-a-ts="1793664000"></div>' });
    jest.mocked(postGoogleNewsResolution).mockResolvedValue({ status: 200, headers: new Headers(), finalUrl: wrapper, body: reply() });
  });

  it('resolves one exact correlated result with a fixed locale page and bounded in-memory RPC', async () => {
    await expect(resolveGoogleNewsArticle(wrapper, options)).resolves.toBe(publisher);
    expect(guardedContentGet).toHaveBeenCalledWith(expect.objectContaining({
      url: wrapper + '?hl=en-US&gl=US&ceid=US%3Aen', timeoutMs: 1000, maxBytes: 1_500_000, maxRedirects: 3,
    }));
    const request = jest.mocked(postGoogleNewsResolution).mock.calls[0]![0];
    const envelope = JSON.parse(new URLSearchParams(request.body).get('f.req')!) as unknown[][][];
    expect(envelope[0]![0]![0]).toBe('Fbv4je');
    expect(envelope[0]![0]![3]).toBe('0');
    expect(JSON.parse(String(envelope[0]![0]![1]))).toEqual(['garturlreq', expect.any(Array), 'CBMi_example', 1793664000, 'fixture-signature']);
  });

  it.each([reply([rpc(publisher, 'other')]), reply([rpc(publisher, null)]), reply([rpc(), rpc()]),
    reply([['wrb.fr', 'unknown', JSON.stringify(['garturlres', publisher]), null, '0']]),
    reply([['wrb.fr', 'Fbv4je', JSON.stringify(['wrong', publisher]), null, '0']]), '[]', '[malformed'])(
  'rejects missing, duplicate, mismatched or malformed RPC authority', (body) => {
    expect(() => parseGoogleNewsPublisher(body)).toThrow();
  });

  it.each(['http://127.0.0.1/report', 'http://169.254.169.254/latest', 'https://user:pass@publisher.test/report',
    'file:///etc/passwd', 'https://news.google.com/read/another', 'https://publisher.test/'])(
  'rejects an unsafe or unresolved publisher URL %s before a publisher request', (url) => {
    expect(() => parseGoogleNewsPublisher(reply([rpc(url)]))).toThrow();
  });

  it.each(['<div></div>', '<div data-n-a-sg="x" data-n-a-ts="invalid"></div>',
    '<div data-n-a-sg="x" data-n-a-ts="1"></div><div data-n-a-sg="y" data-n-a-ts="2"></div>'])(
  'does not invent resolution from absent, malformed or ambiguous signature data', async (body) => {
    jest.mocked(guardedContentGet).mockResolvedValue({ status: 200, headers: new Headers(), finalUrl: wrapper, body });
    await expect(resolveGoogleNewsArticle(wrapper, options)).rejects.toThrow();
    expect(postGoogleNewsResolution).not.toHaveBeenCalled();
  });

  it('does not send signatures after a cross-origin redirect or depleted deadline', async () => {
    jest.mocked(guardedContentGet).mockResolvedValueOnce({ status: 200, headers: new Headers(),
      finalUrl: 'https://consent.google.com/', body: '<div data-n-a-sg="x" data-n-a-ts="1"></div>' });
    await expect(resolveGoogleNewsArticle(wrapper, options)).rejects.toThrow();
    expect(postGoogleNewsResolution).not.toHaveBeenCalled();
    const remainingMs = jest.fn().mockReturnValueOnce(1).mockImplementation(() => { throw new Error('deadline'); });
    await expect(resolveGoogleNewsArticle(wrapper, { ...options, remainingMs })).rejects.toThrow('deadline');
    expect(postGoogleNewsResolution).not.toHaveBeenCalled();
  });
});
