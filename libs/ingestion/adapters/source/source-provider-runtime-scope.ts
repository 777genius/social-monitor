import {
  resolveRuntimeProfile,
  type RuntimeProfile,
} from '@social-monitor/platform-config';

import type { SourceProviderPort } from '../../ports';
import { sourceReadinessProfiles } from './source-readiness-profiles';
import { resolveXCollectorRuntimeConfig } from './x-twitter-experimental-daily/x-collector-runtime-config';

export type SourceProviderRuntimeScope = {
  readonly runtimeProfile: RuntimeProfile;
  readonly githubIssuesCollectorEnabled: boolean;
  readonly xCollectorEnabled: boolean;
  readonly xCollectorRuntimeConfigured: boolean;
};

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

const disabledByDefaultProviderKeys = new Set(['github-issues']);

export const isFixtureSourceProvider = (providerKey: string): boolean =>
  fixtureProviderKeys.has(providerKey);

export const isBetaSourceProvider = (providerKey: string): boolean =>
  betaProviderKeys.has(providerKey);

export const resolveSourceProviderRuntimeScope = (
  env: NodeJS.ProcessEnv,
): SourceProviderRuntimeScope => ({
  runtimeProfile: resolveRuntimeProfile(env),
  githubIssuesCollectorEnabled: env.GITHUB_ISSUES_COLLECTOR_ENABLED === '1',
  xCollectorEnabled:
    env.X_COLLECTOR_ENABLED === '1' ||
    env.X_COLLECTOR_EXPERIMENTAL_ENABLED === '1',
  xCollectorRuntimeConfigured: resolveXCollectorRuntimeConfig(env) !== null,
});

export const shouldIncludeFixtureSourceProviders = (
  scope: SourceProviderRuntimeScope,
): boolean => scope.runtimeProfile !== 'beta';

const isExplicitlyEnabledProductionProvider = (
  providerKey: string,
  scope: SourceProviderRuntimeScope,
): boolean =>
  (providerKey === 'x-twitter' && scope.xCollectorEnabled) ||
  (providerKey === 'github-issues' && scope.githubIssuesCollectorEnabled);

const isEnabledForRuntime = (
  providerKey: string,
  scope: SourceProviderRuntimeScope,
): boolean =>
  !disabledByDefaultProviderKeys.has(providerKey) ||
  isExplicitlyEnabledProductionProvider(providerKey, scope);

export const selectRuntimeSourceProviders = <
  TProvider extends SourceProviderPort,
>(
  providers: readonly TProvider[],
  scope: SourceProviderRuntimeScope,
): readonly TProvider[] =>
  shouldIncludeFixtureSourceProviders(scope)
    ? providers.filter((provider) => isEnabledForRuntime(provider.key(), scope))
    : providers.filter(
        (provider) =>
          isEnabledForRuntime(provider.key(), scope) &&
          (isBetaSourceProvider(provider.key()) ||
            isExplicitlyEnabledProductionProvider(provider.key(), scope)),
      );
