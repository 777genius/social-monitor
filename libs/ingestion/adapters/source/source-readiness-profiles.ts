import type { SourceReadinessProfile } from '../../ports';
import { xTwitterLiveEvidenceRequirements } from './source-live-evidence-requirements';
import type { SourceProviderRuntimeScope } from './source-provider-runtime-scope';
import { sourceReadinessFixtureProfiles } from './source-readiness-fixture-profiles';
import { sourceReadinessWebProfiles } from './source-readiness-web-profiles';
import { sourceReadinessGithubProfiles } from './source-readiness-github-profiles';
import { sourceReadinessCommunityProfiles } from './source-readiness-community-profiles';

export const sourceReadinessProfiles: readonly SourceReadinessProfile[] = [
  ...sourceReadinessFixtureProfiles,
  ...sourceReadinessWebProfiles,
  ...sourceReadinessGithubProfiles,
  ...sourceReadinessCommunityProfiles,
];

export const sourceReadinessProfilesForRuntime = (
  scope: SourceProviderRuntimeScope,
): readonly SourceReadinessProfile[] =>
  sourceReadinessProfiles.map((profile) =>
    profile.providerKey === 'x-twitter' && scope.xCollectorRuntimeConfigured
      ? xTwitterRuntimeReadyProfile(profile)
      : profile.providerKey === 'github-issues' &&
          scope.githubIssuesCollectorEnabled
        ? githubIssuesRuntimeEnabledProfile(profile)
        : profile,
  );

const githubIssuesRuntimeEnabledProfile = (
  profile: SourceReadinessProfile,
): SourceReadinessProfile => ({
  ...profile,
  state: 'enabled_beta',
  liveBetaBlockers: profile.liveBetaBlockers.filter(
    (blocker) => !blocker.includes('GITHUB_ISSUES_COLLECTOR_ENABLED=1'),
  ),
});

const xTwitterRuntimeReadyProfile = (
  profile: SourceReadinessProfile,
): SourceReadinessProfile => ({
  ...profile,
  state: 'enabled_beta',
  runtimeReadiness: 'live_beta_ready',
  liveBetaBlockers: [
    'Daily account caps, x-collector health and rate-limit backoff evidence must be captured before broad rollout.',
    'Rollback must disable X_COLLECTOR_ENABLED or remove X_COLLECTOR_GRPC_ADDRESS.',
  ],
  liveEvidenceRequirements: xTwitterLiveEvidenceRequirements,
});
