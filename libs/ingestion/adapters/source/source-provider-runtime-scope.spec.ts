import type { SourceProviderPort } from '../../ports';
import {
  isBetaSourceProvider,
  isFixtureSourceProvider,
  resolveSourceProviderRuntimeScope,
  selectRuntimeSourceProviders,
} from './source-provider-runtime-scope';

describe('source provider runtime scope', () => {
  it('keeps beta runtime fail-closed to enabled beta providers only', () => {
    const providers = [
      provider('fake-source'),
      provider('hacker-news'),
      provider('rss'),
      provider('github-issues'),
      provider('github-repo-radar'),
      provider('github-trending-page'),
      provider('reddit'),
      provider('x-twitter'),
      provider('unknown-provider'),
    ];

    const selected = selectRuntimeSourceProviders(
      providers,
      resolveSourceProviderRuntimeScope({
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
      }),
    );

    expect(selected.map((item) => item.key())).toEqual([
      'hacker-news',
      'rss',
      'github-repo-radar',
      'github-trending-page',
      'reddit',
    ]);
    expect(isBetaSourceProvider('hacker-news')).toBe(true);
    expect(isBetaSourceProvider('rss')).toBe(true);
    expect(isBetaSourceProvider('github-issues')).toBe(false);
    expect(isBetaSourceProvider('github-repo-radar')).toBe(true);
    expect(isBetaSourceProvider('github-trending-page')).toBe(true);
    expect(isBetaSourceProvider('reddit')).toBe(true);
    expect(isBetaSourceProvider('x-twitter')).toBe(false);
    expect(isBetaSourceProvider('unknown-provider')).toBe(false);
    expect(isFixtureSourceProvider('fake-source')).toBe(true);
    expect(isFixtureSourceProvider('x-twitter')).toBe(true);
  });

  it('keeps local and deterministic runtimes open for fixture certification providers except disabled defaults', () => {
    const providers = [
      provider('fake-source'),
      provider('github-issues'),
      provider('x-twitter'),
      provider('unknown-provider'),
    ];

    const selected = selectRuntimeSourceProviders(
      providers,
      resolveSourceProviderRuntimeScope({
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'deterministic-test',
      }),
    );

    expect(selected.map((item) => item.key())).toEqual([
      'fake-source',
      'x-twitter',
      'unknown-provider',
    ]);
  });

  it('allows GitHub issues only when the issue collector is explicitly enabled', () => {
    const providers = [
      provider('hacker-news'),
      provider('github-issues'),
      provider('github-repo-radar'),
    ];

    const selected = selectRuntimeSourceProviders(
      providers,
      resolveSourceProviderRuntimeScope({
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
        GITHUB_ISSUES_COLLECTOR_ENABLED: '1',
      }),
    );

    expect(selected.map((item) => item.key())).toEqual([
      'hacker-news',
      'github-issues',
      'github-repo-radar',
    ]);
  });

  it('allows the canonical X provider in beta only when x-collector is explicitly enabled', () => {
    const providers = [
      provider('hacker-news'),
      provider('x-twitter'),
      provider('unknown-provider'),
    ];

    const selected = selectRuntimeSourceProviders(
      providers,
      resolveSourceProviderRuntimeScope({
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
        X_COLLECTOR_ENABLED: '1',
      }),
    );

    expect(selected.map((item) => item.key())).toEqual([
      'hacker-news',
      'x-twitter',
    ]);
  });

  it('keeps the legacy x-collector flag as a compatibility alias', () => {
    const selected = selectRuntimeSourceProviders(
      [provider('x-twitter')],
      resolveSourceProviderRuntimeScope({
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
        X_COLLECTOR_EXPERIMENTAL_ENABLED: '1',
      }),
    );

    expect(selected.map((item) => item.key())).toEqual(['x-twitter']);
  });
});

const provider = (providerKey: string): SourceProviderPort => ({
  key: () => providerKey,
  capabilityProfile: () => {
    throw new Error('capabilityProfile is not needed for runtime scope tests');
  },
  validateBinding: () => {
    throw new Error('validateBinding is not needed for runtime scope tests');
  },
  planScan: () => {
    throw new Error('planScan is not needed for runtime scope tests');
  },
  scan: () => {
    throw new Error('scan is not needed for runtime scope tests');
  },
  classifyError: () => {
    throw new Error('classifyError is not needed for runtime scope tests');
  },
});
