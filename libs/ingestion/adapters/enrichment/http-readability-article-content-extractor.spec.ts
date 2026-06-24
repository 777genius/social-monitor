import { HttpReadabilityArticleContentExtractor } from './http-readability-article-content-extractor';

const articleHtml = `
  <!doctype html>
  <html>
    <head><title>Ignored shell title</title></head>
    <body>
      <nav>Navigation should not dominate the readable article.</nav>
      <article>
        <h1>Open source agent tools are moving fast</h1>
        <p>${'Developers are comparing agent workflows, release velocity and integration quality. '.repeat(10)}</p>
        <p>${'The strongest signal is practical adoption across real projects and CI automation. '.repeat(8)}</p>
      </article>
    </body>
  </html>
`;

describe('HttpReadabilityArticleContentExtractor', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('extracts readable article text with stable content hashes and fingerprints', async () => {
    global.fetch = jest.fn(async () => responseFor('https://example.test/article', articleHtml, {
      'content-type': 'text/html; charset=utf-8',
    })) as typeof fetch;
    const extractor = new HttpReadabilityArticleContentExtractor({
      minTextCharacters: 120,
      maxTextCharacters: 2_000,
    });

    const result = await extractor.extract({
      url: 'https://example.test/article',
      correlationId: 'corr-article-extract',
    });

    expect(result).toMatchObject({
      ok: true,
      sourceUrl: 'https://example.test/article',
      finalUrl: 'https://example.test/article',
      title: 'Open source agent tools are moving fast',
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      semanticFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
    });
    if (result.ok) {
      expect(result.text).toContain('Developers are comparing agent workflows');
      expect(result.text).not.toContain('Navigation should not dominate');
      expect(result.wordCount).toBeGreaterThan(80);
    }
  });

  it('rejects private-network article URLs before fetching', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const extractor = new HttpReadabilityArticleContentExtractor();

    const result = await extractor.extract({
      url: 'http://127.0.0.1/article',
      correlationId: 'corr-private-url',
    });

    expect(result).toEqual({
      ok: false,
      sourceUrl: 'http://127.0.0.1/article',
      reason: 'Article URL must not target private or local networks.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates redirect targets before following them', async () => {
    global.fetch = jest.fn(async () => responseFor('https://example.test/start', '', {
      location: 'http://169.254.169.254/latest/meta-data',
    }, 302)) as typeof fetch;
    const extractor = new HttpReadabilityArticleContentExtractor();

    await expect(extractor.extract({
      url: 'https://example.test/start',
      correlationId: 'corr-redirect',
    })).rejects.toThrow('Article URL must not target private or local networks.');
  });
});

const responseFor = (
  url: string,
  body: string,
  headers: Record<string, string>,
  status = 200,
): Response => {
  const response = new Response(body, {
    status,
    headers,
  });
  Object.defineProperty(response, 'url', { value: url });

  return response;
};
