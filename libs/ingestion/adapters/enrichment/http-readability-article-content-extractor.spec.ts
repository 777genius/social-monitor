import { guardedContentGet } from '../http/guarded-content-http';
jest.mock('../http/guarded-content-http', () => ({ guardedContentGet: jest.fn() }));
import { HttpReadabilityArticleContentExtractor } from './http-readability-article-content-extractor';

// Some fixtures perform two separately bounded 10-second extractions.
jest.setTimeout(25_000);

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

  beforeEach(() => {
    jest.mocked(guardedContentGet).mockImplementation(async (input) => {
      const response = await globalThis.fetch(input.url, { headers: input.headers });
      return { status: response.status, headers: response.headers,
        finalUrl: response.url || input.url, body: await response.text() };
    });
  });

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

  it('retains a 40k article and its late qualification within the 64k capture envelope', async () => {
    const text = 'Practical details. '.repeat(2200) + 'Qualification: this is not a controlled trial.';
    global.fetch = jest.fn(async () => responseFor('https://example.test/article',
      `<article><h1>Report</h1><p>${text}</p></article>`, { 'content-type': 'text/html' })) as typeof fetch;
    const result = await new HttpReadabilityArticleContentExtractor().extract({
      url: 'https://example.test/article', correlationId: 'capture-test',
    });
    expect(result).toMatchObject({ ok: true, truncated: false, extractionVersion: 'readability.text.v2' });
    if (result.ok) {
      expect(result.text.length).toBeGreaterThan(40_000);
      expect(result.text).toContain('Qualification: this is not a controlled trial.');
      expect(result.originalTextLength).toBe(result.text.length);
    }
  });

  it('reports truncation and hashes the full normalized article including the omitted tail', async () => {
    let tail = 'A';
    global.fetch = jest.fn(async () => responseFor('https://example.test/article',
      `<article><p>${'Detail. '.repeat(10_000)}${tail}</p></article>`, { 'content-type': 'text/html' })) as typeof fetch;
    const extractor = new HttpReadabilityArticleContentExtractor();
    const first = await extractor.extract({ url: 'https://example.test/article', correlationId: 'capture-test' });
    tail = 'B';
    const second = await extractor.extract({ url: 'https://example.test/article', correlationId: 'capture-test' });
    expect(first).toMatchObject({ ok: true, truncated: true });
    if (first.ok && second.ok) {
      expect(first.text.length).toBeLessThanOrEqual(64_000);
      expect(first.originalTextLength).toBeGreaterThan(64_000);
      expect(first.text).toBe(second.text);
      expect(first.fullTextSha256).not.toBe(second.fullTextSha256);
    }
  });

  it('enforces the remaining scan budget even before its abort notification arrives', async () => {
    jest.mocked(guardedContentGet).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { status: 200, headers: new Headers({ 'content-type': 'text/html' }),
        finalUrl: 'https://example.test/article', body: articleHtml };
    });
    await expect(new HttpReadabilityArticleContentExtractor().extract({
      url: 'https://example.test/article', correlationId: 'scan-budget', remainingBudgetMs: 10,
      signal: new AbortController().signal,
    })).rejects.toThrow('deadline');
  });

  it('rejects private-network article URLs before fetching', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const extractor = new HttpReadabilityArticleContentExtractor();

    const result = await extractor.extract({
      url: 'http://127.0.0.1/article',
      correlationId: 'corr-private-url',
    });

    expect(result).toMatchObject({
      ok: false,
      sourceUrl: 'http://127.0.0.1/article',
      reason: 'Article URL must not target private or local networks.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates redirect targets before following them', async () => {
    jest.mocked(guardedContentGet).mockRejectedValue(new Error('Content URL must not target private or local networks.'));
    const extractor = new HttpReadabilityArticleContentExtractor();

    await expect(extractor.extract({
      url: 'https://example.test/start',
      correlationId: 'corr-redirect',
    })).rejects.toThrow('Content URL must not target private or local networks.');
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
