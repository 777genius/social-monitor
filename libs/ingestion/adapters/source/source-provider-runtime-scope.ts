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

export const selectRuntimeSourceProviders = <TProvider extends SourceProviderPort>(
  providers: readonly TProvider[],
  env: NodeJS.ProcessEnv,
): readonly TProvider[] =>
  shouldIncludeFixtureSourceProviders(env)
    ? providers
    : providers.filter((provider) => isBetaSourceProvider(provider.key()));
