import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

interface BootstrapFetchOptions {
  readonly cache?: string;
  readonly credentials?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

interface BootstrapFetchResponse {
  readonly ok: boolean;
  text(): Promise<string>;
}

interface BootstrapBridge {
  take(): Promise<string | null>;
}

type BootstrapFetch = (
  url: string,
  options: BootstrapFetchOptions,
) => Promise<BootstrapFetchResponse>;

const html = readFileSync('apps/frontend/app/web/index.html', 'utf8');
const bridgeMarker = html.indexOf('window.socialMonitorAppBootstrap');
const scriptStart = html.lastIndexOf('<script>', bridgeMarker);
const scriptEnd = html.indexOf('</script>', bridgeMarker);

if (bridgeMarker < 0 || scriptStart < 0 || scriptEnd < 0) {
  throw new Error('Early app bootstrap script is missing from web/index.html');
}

const bridgeScript = html.slice(scriptStart + '<script>'.length, scriptEnd);

const executeBridge = (fetch: BootstrapFetch): BootstrapBridge => {
  const browserWindow: { socialMonitorAppBootstrap?: BootstrapBridge } = {};
  runInNewContext(bridgeScript, {
    AbortController,
    Promise,
    clearTimeout,
    fetch,
    setTimeout,
    window: browserWindow,
  });
  const bridge = browserWindow.socialMonitorAppBootstrap;
  if (bridge === undefined) {
    throw new Error('Early app bootstrap script did not publish its bridge');
  }
  return bridge;
};

describe('early app bootstrap HTML bridge', () => {
  it('starts a no-store credentialed request immediately and consumes it once', async () => {
    let resolveFetch!: (response: BootstrapFetchResponse) => void;
    const fetch = jest.fn(
      () =>
        new Promise<BootstrapFetchResponse>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const bridge = executeBridge(fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/app/bootstrap',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    );

    const first = bridge.take();
    await expect(bridge.take()).resolves.toBeNull();
    resolveFetch({
      ok: true,
      text: async () => '{"session":{}}',
    });
    await expect(first).resolves.toBe('{"session":{}}');
  });

  it('aborts and resolves to fallback when fetch never settles', async () => {
    jest.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const bridge = executeBridge((_url, options) => {
        signal = options.signal;
        return new Promise<BootstrapFetchResponse>(() => undefined);
      });

      const response = bridge.take();
      jest.advanceTimersByTime(3_000);

      expect(signal?.aborted).toBe(true);
      await expect(response).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('turns non-2xx and rejected fetches into safe fallback values', async () => {
    const text = jest.fn(async () => 'not used');
    const nonOkBridge = executeBridge(async () => ({ ok: false, text }));
    await expect(nonOkBridge.take()).resolves.toBeNull();
    expect(text).not.toHaveBeenCalled();

    const rejectedBridge = executeBridge(async () => {
      throw new Error('network failed');
    });
    await expect(rejectedBridge.take()).resolves.toBeNull();
  });
});
