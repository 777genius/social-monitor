import { resolveRuntimeProfile } from '@social-monitor/platform-config';

import type { SourceProviderPort } from '../../ports';

const fixtureProviderKeys = new Set(['fake-source']);

export const isFixtureSourceProvider = (providerKey: string): boolean => fixtureProviderKeys.has(providerKey);

export const shouldIncludeFixtureSourceProviders = (env: NodeJS.ProcessEnv): boolean =>
  resolveRuntimeProfile(env) !== 'beta';

export const selectRuntimeSourceProviders = <TProvider extends SourceProviderPort>(
  providers: readonly TProvider[],
  env: NodeJS.ProcessEnv,
): readonly TProvider[] =>
  shouldIncludeFixtureSourceProviders(env)
    ? providers
    : providers.filter((provider) => !isFixtureSourceProvider(provider.key()));
