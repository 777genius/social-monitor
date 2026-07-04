import { resolveSocialResearchRuntimeSettings } from './social-research-runtime-settings';

describe('resolveSocialResearchRuntimeSettings', () => {
  it('defaults to policy guardrails with result cache disabled', () => {
    expect(resolveSocialResearchRuntimeSettings({ NODE_ENV: 'test' })).toEqual({
      executionPolicy: {
        requireExecutionScope: true,
        requireSourceBindings: true,
        requireSourceRuntimeReadiness: true,
        allowedRuntimeReadiness: ['fixture_ready', 'live_beta_ready'],
        allowedSources: undefined,
        maxLanes: undefined,
        maxItemsPerLane: undefined,
        includeCacheKeys: false,
      },
      resultCache: {
        mode: 'disabled',
        ttlMs: 300_000,
        maxEntries: 250,
      },
    });
  });

  it('parses explicit local ephemeral cache and policy limits', () => {
    expect(
      resolveSocialResearchRuntimeSettings({
        NODE_ENV: 'development',
        SOCIAL_RESEARCH_RESULT_CACHE: 'ephemeral',
        SOCIAL_RESEARCH_RESULT_CACHE_TTL_MS: '120000',
        SOCIAL_RESEARCH_RESULT_CACHE_MAX_ENTRIES: '25',
        SOCIAL_RESEARCH_ALLOWED_SOURCES: 'reddit, x-twitter ',
        SOCIAL_RESEARCH_MAX_LANES: '8',
        SOCIAL_RESEARCH_MAX_ITEMS_PER_LANE: '50',
      }),
    ).toEqual({
      executionPolicy: {
        requireExecutionScope: true,
        requireSourceBindings: true,
        requireSourceRuntimeReadiness: true,
        allowedRuntimeReadiness: ['fixture_ready', 'live_beta_ready'],
        allowedSources: ['reddit', 'x-twitter'],
        maxLanes: 8,
        maxItemsPerLane: 50,
        includeCacheKeys: true,
      },
      resultCache: {
        mode: 'ephemeral',
        ttlMs: 120_000,
        maxEntries: 25,
      },
    });
  });

  it('allows durable Prisma cache in beta runtime profile', () => {
    expect(
      resolveSocialResearchRuntimeSettings({
        NODE_ENV: 'production',
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
        SOCIAL_RESEARCH_RESULT_CACHE: 'prisma',
      }),
    ).toMatchObject({
      executionPolicy: {
        allowedRuntimeReadiness: ['live_beta_ready'],
        includeCacheKeys: true,
      },
      resultCache: {
        mode: 'prisma',
      },
    });
  });

  it('rejects process-local cache in beta runtime profile', () => {
    expect(() =>
      resolveSocialResearchRuntimeSettings({
        NODE_ENV: 'production',
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
        SOCIAL_RESEARCH_RESULT_CACHE: 'ephemeral',
      }),
    ).toThrow(
      'SOCIAL_RESEARCH_RESULT_CACHE=ephemeral is not allowed when SOCIAL_MONITOR_RUNTIME_PROFILE=beta',
    );
  });

  it('rejects unknown cache modes', () => {
    expect(() =>
      resolveSocialResearchRuntimeSettings({
        NODE_ENV: 'test',
        SOCIAL_RESEARCH_RESULT_CACHE: 'memory',
      }),
    ).toThrow(
      'SOCIAL_RESEARCH_RESULT_CACHE must be "disabled", "ephemeral", or "prisma"',
    );
  });

  it('parses explicit allowed runtime readiness values', () => {
    expect(
      resolveSocialResearchRuntimeSettings({
        NODE_ENV: 'test',
        SOCIAL_RESEARCH_ALLOWED_RUNTIME_READINESS:
          'fixture_ready, live_beta_ready',
      }).executionPolicy.allowedRuntimeReadiness,
    ).toEqual(['fixture_ready', 'live_beta_ready']);
  });

  it('rejects unknown allowed runtime readiness values', () => {
    expect(() =>
      resolveSocialResearchRuntimeSettings({
        NODE_ENV: 'test',
        SOCIAL_RESEARCH_ALLOWED_RUNTIME_READINESS: 'private_cookie_ready',
      }),
    ).toThrow(
      'SOCIAL_RESEARCH_ALLOWED_RUNTIME_READINESS contains unsupported value private_cookie_ready',
    );
  });
});
