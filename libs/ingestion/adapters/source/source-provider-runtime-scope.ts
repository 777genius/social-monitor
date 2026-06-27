import { resolveRuntimeProfile } from '@social-monitor/platform-config';

import type { SourceProviderPort } from '../../ports';
import { sourceReadinessProfiles } from './source-readiness-profiles';

const fixtureProviderKeys = new Set(
  sourceReadinessProfiles
    .filter((profile) => profile.state !== 'enabled_beta')
    .map((profile) => profile.providerKey),
);
const betaProviderKeys = new Set(
  sourceReadinessProfiles
    .filter((profile) => profile.state === 'enabled_beta')
    .map((profile) => profile.providerKey),
);

export const isFixtureSourceProvider = (providerKey: string): boolean => fixtureProviderKeys.has(providerKey);

export const isBetaSourceProvider = (providerKey: string): boolean => betaProviderKeys.has(providerKey);

export const shouldIncludeFixtureSourceProviders = (env: NodeJS.ProcessEnv): boolean =>
  resolveRuntimeProfile(env) !== 'beta';

const isExplicitlyEnabledProductionProvider = (
  providerKey: string,
  env: NodeJS.ProcessEnv,
): boolean =>
  providerKey === 'x-twitter' &&
  (env.X_COLLECTOR_ENABLED === '1' || env.X_COLLECTOR_EXPERIMENTAL_ENABLED === '1');

export const selectRuntimeSourceProviders = <TProvider extends SourceProviderPort>(
  providers: readonly TProvider[],
  env: NodeJS.ProcessEnv,
): readonly TProvider[] =>
  shouldIncludeFixtureSourceProviders(env)
    ? providers
    : providers.filter((provider) =>
        isBetaSourceProvider(provider.key()) ||
        isExplicitlyEnabledProductionProvider(provider.key(), env),
      );
