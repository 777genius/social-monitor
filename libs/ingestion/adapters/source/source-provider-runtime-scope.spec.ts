import type { SourceProviderPort } from '../../ports';
import {
  isBetaSourceProvider,
  isFixtureSourceProvider,
  selectRuntimeSourceProviders,
} from './source-provider-runtime-scope';

describe('source provider runtime scope', () => {
  it('keeps beta runtime fail-closed to enabled beta providers only', () => {
    const providers = [
      provider('fake-source'),
      provider('github-issues'),
      provider('reddit'),
      provider('x-twitter'),
      provider('unknown-provider'),
    ];

    const selected = selectRuntimeSourceProviders(providers, {
      SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
    });

    expect(selected.map((item) => item.key())).toEqual([
      'github-issues',
      'reddit',
    ]);
    expect(isBetaSourceProvider('github-issues')).toBe(true);
    expect(isBetaSourceProvider('reddit')).toBe(true);
    expect(isBetaSourceProvider('x-twitter')).toBe(false);
    expect(isBetaSourceProvider('unknown-provider')).toBe(false);
    expect(isFixtureSourceProvider('fake-source')).toBe(true);
    expect(isFixtureSourceProvider('x-twitter')).toBe(true);
  });

  it('keeps local and deterministic runtimes open for fixture certification providers', () => {
    const providers = [
      provider('fake-source'),
      provider('github-issues'),
      provider('x-twitter'),
      provider('unknown-provider'),
    ];

    const selected = selectRuntimeSourceProviders(providers, {
      SOCIAL_MONITOR_RUNTIME_PROFILE: 'deterministic-test',
    });

    expect(selected.map((item) => item.key())).toEqual([
      'fake-source',
      'github-issues',
      'x-twitter',
      'unknown-provider',
    ]);
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
