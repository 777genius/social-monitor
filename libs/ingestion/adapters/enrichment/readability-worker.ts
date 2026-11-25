import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

export type ReadableArticle = { readonly title?: string; readonly text: string };

// A separate isolate is required: JSDOM and Readability synchronously block
// their thread, so a Promise timeout in the calling thread cannot cancel them.
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { JSDOM, VirtualConsole } = require(workerData.jsdomModule);
const { Readability } = require(workerData.readabilityModule);
let dom;
try {
  // Never let JSDOM's default VirtualConsole forward provider-controlled
  // parser diagnostics to the worker's stderr. Diagnostics, if added later,
  // must be fixed strings with no document or URL material.
  const virtualConsole = new VirtualConsole();
  dom = new JSDOM(workerData.html, { url: workerData.url, virtualConsole });
  const heading = dom.window.document.querySelector('article h1, main h1, h1')?.textContent?.trim() || undefined;
  const article = new Readability(dom.window.document).parse();
  parentPort.postMessage({
    title: heading ?? article?.title ?? dom.window.document.title,
    text: article?.textContent ?? dom.window.document.body?.textContent ?? '',
  });
} finally {
  dom?.window.close();
}
`;

export const parseReadableArticleInWorker = async (
  html: string, url: string, timeoutMs: number, signal?: AbortSignal,
): Promise<ReadableArticle> => {
  signal?.throwIfAborted();
  if (timeoutMs <= 0) throw new Error('Article extraction deadline exceeded');
  const deadline = performance.now() + timeoutMs;
  const worker = new Worker(workerSource, {
    eval: true,
    stderr: true,
    workerData: { html, url, jsdomModule: require.resolve('jsdom'), readabilityModule: require.resolve('@mozilla/readability') },
  });
  // Defense in depth: do not inherit worker stderr if a dependency writes
  // directly instead of using JSDOM's detached VirtualConsole.
  worker.stderr?.resume();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<ReadableArticle>((resolve, reject) => {
      const expired = () => reject(new Error('Article extraction deadline exceeded'));
      onAbort = () => reject(signal?.reason ?? new Error('Article scan deadline exceeded'));
      timer = setTimeout(expired, Math.max(0, deadline - performance.now()));
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.once('error', reject);
      worker.once('exit', () => reject(new Error('Article parser exited without a result')));
      worker.once('message', (article: ReadableArticle) => {
        if (signal?.aborted) { onAbort!(); return; }
        if (performance.now() >= deadline) { expired(); return; }
        resolve(article);
      });
      if (signal?.aborted) onAbort();
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort);
    // Await termination on every path, including success, before releasing
    // ownership. No abandoned synchronous parser survives a rejected result.
    await worker.terminate();
  }
};
