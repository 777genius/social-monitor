import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

interface BuildDescription {
  compileTarget: string;
  mainWasmPath?: string;
  jsSupportRuntimePath?: string;
  mainJsPath?: string;
}
interface Preload { rel?: string; href?: string; as?: string; type?: string; crossOrigin?: string }

const template = readFileSync('apps/frontend/app/web/flutter_bootstrap.js', 'utf8');
const firstRelease = 'a'.repeat(40);
const nextRelease = 'b'.repeat(40);
const productionBuilds = (): BuildDescription[] => [
  { compileTarget: 'dart2wasm', mainWasmPath: 'main.dart.wasm', jsSupportRuntimePath: 'main.dart.mjs' },
  { compileTarget: 'dart2js', mainJsPath: 'main.dart.js?existing=1' },
];

const execute = (release: string, builds = productionBuilds(), baseURI = 'https://reader.example/app/') => {
  const preloads: Preload[] = [];
  const load = jest.fn();
  const script = template
    .replace('{{flutter_js}}', '')
    .replace('{{flutter_build_config}}', '')
    .replace('{{SOCIAL_MONITOR_RELEASE_ID}}', release);
  const run = () => runInNewContext(script, {
    URL, Date,
    _flutter: { buildConfig: { builds }, loader: { load } },
    document: {
      baseURI,
      createElement: () => ({}),
      head: { appendChild: (link: Preload) => preloads.push(link) },
    },
  });
  return { run, builds, preloads, load };
};

const entrypoints = (builds: BuildDescription[]) => [
  builds[0]!.mainWasmPath!, builds[0]!.jsSupportRuntimePath!, builds[1]!.mainJsPath!,
];

describe('frontend release asset cache coherence', () => {
  it('versions the complete compiler pair and JS fallback before loading', () => {
    const result = execute(firstRelease);
    result.run();

    expect(entrypoints(result.builds)).toEqual([
      `https://reader.example/app/main.dart.wasm?v=${firstRelease}`,
      `https://reader.example/app/main.dart.mjs?v=${firstRelease}`,
      `https://reader.example/app/main.dart.js?existing=1&v=${firstRelease}`,
    ]);
    expect(result.preloads).toEqual([
      { rel: 'modulepreload', href: result.builds[0]!.jsSupportRuntimePath },
      { rel: 'preload', href: result.builds[0]!.mainWasmPath, as: 'fetch', type: 'application/wasm', crossOrigin: 'use-credentials' },
    ]);
    expect(result.load).toHaveBeenCalledTimes(1);
  });

  it('a new release cannot address any entrypoint cached under the old release', () => {
    const previous = execute(firstRelease);
    const next = execute(nextRelease);
    previous.run(); next.run();

    for (const url of entrypoints(next.builds)) {
      expect(entrypoints(previous.builds)).not.toContain(url);
      expect(new URL(url).searchParams.get('v')).toBe(nextRelease);
    }
  });

  it.each(['', '{{SOCIAL_MONITOR_RELEASE_ID}}', 'invalid', 'a'.repeat(39)])(
    'refuses a release build with missing or invalid identity: %s', (release) => {
      const result = execute(release);
      expect(result.run).toThrow('Frontend release identity is missing or invalid');
      expect(result.preloads).toEqual([]);
      expect(result.load).not.toHaveBeenCalled();
    },
  );

  it('keeps local dartdevc startup available without a production identity', () => {
    const result = execute('{{SOCIAL_MONITOR_RELEASE_ID}}', [
      { compileTarget: 'dartdevc', mainJsPath: 'main_module.bootstrap.js' },
    ]);
    result.run();
    expect(new URL(result.builds[0]!.mainJsPath!).searchParams.get('v')).toMatch(/^development-\d+$/);
    expect(result.load).toHaveBeenCalledTimes(1);
  });
});
