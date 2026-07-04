import { sourceReadinessProfilesForRuntime } from './source-readiness-profiles';
import { resolveSourceProviderRuntimeScope } from './source-provider-runtime-scope';

describe('sourceReadinessProfilesForRuntime', () => {
  it('keeps GitHub issues manual-only unless the issue collector is explicitly enabled', () => {
    expect(githubIssuesProfile({})).toMatchObject({
      providerKey: 'github-issues',
      state: 'manual_only',
      runtimeReadiness: 'fixture_ready',
      liveBetaBlockers: expect.arrayContaining([
        expect.stringContaining('GITHUB_ISSUES_COLLECTOR_ENABLED=1'),
      ]),
    });

    expect(
      githubIssuesProfile({ GITHUB_ISSUES_COLLECTOR_ENABLED: '1' }),
    ).toMatchObject({
      providerKey: 'github-issues',
      state: 'enabled_beta',
      runtimeReadiness: 'fixture_ready',
      liveBetaBlockers: expect.not.arrayContaining([
        expect.stringContaining('GITHUB_ISSUES_COLLECTOR_ENABLED=1'),
      ]),
    });
  });

  it('keeps X/Twitter deferred unless the collector runtime is fully configured', () => {
    expect(xProfile({ X_COLLECTOR_ENABLED: '1' })).toMatchObject({
      providerKey: 'x-twitter',
      state: 'provider_only',
      runtimeReadiness: 'deferred',
      liveEvidenceRequirements: [],
    });
  });

  it('marks X/Twitter live-ready when the collector flag and gRPC address are configured', () => {
    expect(
      xProfile({
        X_COLLECTOR_ENABLED: '1',
        X_COLLECTOR_GRPC_ADDRESS: '127.0.0.1:50051',
      }),
    ).toMatchObject({
      providerKey: 'x-twitter',
      state: 'enabled_beta',
      runtimeReadiness: 'live_beta_ready',
      liveEvidenceRequirements: expect.arrayContaining([
        expect.objectContaining({
          signalId: 'x-collector-live-search-smoke',
          verificationCommand:
            'X_COLLECTOR_REAL_E2E=1 npm run x-collector:test',
        }),
      ]),
    });
  });
});

const githubIssuesProfile = (env: NodeJS.ProcessEnv) => {
  const profile = sourceReadinessProfilesForRuntime(
    resolveSourceProviderRuntimeScope(env),
  ).find(
    (item) => item.providerKey === 'github-issues',
  );

  if (profile === undefined) {
    throw new Error('Expected GitHub issues profile');
  }

  return profile;
};

const xProfile = (env: NodeJS.ProcessEnv) => {
  const profile = sourceReadinessProfilesForRuntime(
    resolveSourceProviderRuntimeScope(env),
  ).find(
    (item) => item.providerKey === 'x-twitter',
  );

  if (profile === undefined) {
    throw new Error('Expected X/Twitter profile');
  }

  return profile;
};
