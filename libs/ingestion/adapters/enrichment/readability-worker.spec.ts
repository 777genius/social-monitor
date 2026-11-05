import { performance } from 'node:perf_hooks';
import { parseReadableArticleInWorker } from './readability-worker';

const expensiveHtml = `<article>${'<div><p>A qualification in a deeply structured document.</p></div>'.repeat(20_000)}</article>`;

describe('interruptible Readability parsing', () => {
  it('does not forward malformed provider CSS or HTML diagnostics to process output', async () => {
    const marker = 'malformed-provider-css-marker';
    const stderr: string[] = [];
    const consoleErrors: unknown[][] = [];
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args);
    });
    try {
      await expect(parseReadableArticleInWorker(
        `<style>@media { /* ${marker} */</style><article><h1>Report</h1><p>Readable body.</p></article>`,
        'https://example.test/article',
        3000,
      )).resolves.toMatchObject({ title: 'Report' });
      expect(stderr.join('')).not.toContain(marker);
      expect(JSON.stringify(consoleErrors)).not.toContain(marker);
      expect(stderr).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      stderrSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it('keeps the caller responsive and terminates slow parsing at the extraction deadline', async () => {
    const started = performance.now();
    let heartbeat = false;
    const timer = setTimeout(() => { heartbeat = true; }, 30);
    try {
      await expect(parseReadableArticleInWorker(expensiveHtml, 'https://example.test/', 800))
        .rejects.toThrow('deadline');
      expect(heartbeat).toBe(true);
      expect(performance.now() - started).toBeLessThan(3000);
    } finally { clearTimeout(timer); }
  });

  it('terminates slow parsing when the enclosing scan is cancelled', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('scan deadline exceeded')), 800);
    const started = performance.now();
    try {
      await expect(parseReadableArticleInWorker(expensiveHtml, 'https://example.test/', 10_000, controller.signal))
        .rejects.toThrow('scan deadline exceeded');
      expect(performance.now() - started).toBeLessThan(3000);
    } finally { clearTimeout(timer); }
  });

  it('rejects already expired extraction and scan budgets before creating a worker', async () => {
    await expect(parseReadableArticleInWorker('<p>text</p>', 'https://example.test/', 0)).rejects.toThrow('deadline');
    await expect(parseReadableArticleInWorker('<p>text</p>', 'https://example.test/', 1000,
      AbortSignal.abort(new Error('cancelled')))).rejects.toThrow('cancelled');
  });
});
