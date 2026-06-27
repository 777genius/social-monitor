import { sourceReadinessProfilesForRuntime } from './source-readiness-profiles';

describe('sourceReadinessProfilesForRuntime', () => {
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
          verificationCommand: 'X_COLLECTOR_REAL_E2E=1 npm run x-collector:test',
        }),
      ]),
    });
  });
});

const xProfile = (env: NodeJS.ProcessEnv) => {
  const profile = sourceReadinessProfilesForRuntime(env).find(
    (item) => item.providerKey === 'x-twitter',
  );

  if (profile === undefined) {
    throw new Error('Expected X/Twitter profile');
  }

  return profile;
};
