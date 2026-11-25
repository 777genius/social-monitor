import {
  DefaultSocialResearchExecutionPolicy,
  SocialResearchCacheKeyBuilder,
  type SocialResearchCacheKeyHasherPort,
} from '@social-monitor/social-research';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

describe('DefaultSocialResearchExecutionPolicy', () => {
  it('denies search execution without an execution scope', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy();

    await expect(
      policy.authorizeSearch({ plan: validPlan() }),
    ).resolves.toEqual({
      allowed: false,
      reason: 'Execution scope is required for social research.',
    });
  });

  it('denies search execution when a required source binding is missing', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy();

    await expect(
      policy.authorizeSearch({
        plan: validPlan(),
        execution: {
          tenantId: tenantId('tenant-policy-test'),
          workspaceId: workspaceId('workspace-policy-test'),
          scanJobId: 'scan-policy-test',
          sourceBindingIdBySource: {},
        },
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: 'Source binding is required for social research source reddit.',
    });
  });

  it('denies sources outside the allowed source set', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy({
      allowedSources: ['github'],
    });

    await expect(
      policy.authorizeSearch({
        plan: validPlan(),
        execution: executionScope(),
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: 'Source is not allowed for social research: reddit.',
    });
  });

  it('denies sources whose runtime readiness is deferred', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy();

    await expect(
      policy.authorizeSearch({
        plan: validPlan({ sourceKey: 'x-twitter' }),
        execution: {
          ...executionScope(),
          sourceBindingIdBySource: {
            'x-twitter': 'binding-x',
          },
        },
      }),
    ).resolves.toEqual({
      allowed: false,
      reason:
        'Source x-twitter is not ready for social research execution: runtimeReadiness=deferred.',
    });
  });

  it('allows deferred sources only when runtime readiness checks are explicitly disabled', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy({
      requireSourceRuntimeReadiness: false,
      includeCacheKeys: false,
    });

    await expect(
      policy.authorizeSearch({
        plan: validPlan({ sourceKey: 'x-twitter' }),
        execution: {
          ...executionScope(),
          sourceBindingIdBySource: {
            'x-twitter': 'binding-x',
          },
        },
      }),
    ).resolves.toEqual({
      allowed: true,
    });
  });

  it('denies custom sources without readiness profiles by default', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy();

    await expect(
      policy.authorizeSearch({
        plan: validPlan({ sourceKey: 'mastodon' }),
        execution: {
          ...executionScope(),
          sourceBindingIdBySource: {
            mastodon: 'binding-mastodon',
          },
        },
      }),
    ).resolves.toEqual({
      allowed: false,
      reason:
        'Source readiness profile is required for social research source mastodon.',
    });
  });

  it('accepts custom source readiness profiles when runtime readiness is allowed', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy({
      includeCacheKeys: false,
      sourceCapabilities: [
        {
          sourceKey: 'mastodon',
          version: 1,
          supportedOperations: ['search'],
          readiness: {
            state: 'enabled_beta',
            runtimeReadiness: 'fixture_ready',
          },
        },
      ],
    });

    await expect(
      policy.authorizeSearch({
        plan: validPlan({ sourceKey: 'mastodon' }),
        execution: {
          ...executionScope(),
          sourceBindingIdBySource: {
            mastodon: 'binding-mastodon',
          },
        },
      }),
    ).resolves.toEqual({
      allowed: true,
    });
  });

  it('returns a stable hashed cache key for an allowed search', async () => {
    const hasher: SocialResearchCacheKeyHasherPort = {
      hash(value) {
        return `hash:${value.length}`;
      },
    };
    const policy = new DefaultSocialResearchExecutionPolicy({
      cacheKeyBuilder: new SocialResearchCacheKeyBuilder({
        namespace: 'test-social',
        hasher,
      }),
    });

    await expect(
      policy.authorizeSearch({
        plan: validPlan(),
        execution: executionScope(),
      }),
    ).resolves.toEqual({
      allowed: true,
      cacheKey: expect.stringMatching(/^test-social:v1:search:hash:\d+$/),
      cacheScope: {
        tenantId: tenantId('tenant-policy-test'),
        workspaceId: workspaceId('workspace-policy-test'),
      },
    });
  });

  it('omits cache scope when cache keys are disabled', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy({
      includeCacheKeys: false,
    });

    await expect(
      policy.authorizeSearch({
        plan: validPlan(),
        execution: executionScope(),
      }),
    ).resolves.toEqual({
      allowed: true,
    });
  });

  it('validates thread fetch source bindings when source is known', async () => {
    const policy = new DefaultSocialResearchExecutionPolicy();

    await expect(
      policy.authorizeThreadFetch({
        command: {
          sourceKey: 'reddit',
          externalId: 'reddit:t3_thread',
          execution: {
            ...executionScope(),
            sourceBindingIdBySource: {},
          },
        },
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: 'Source binding is required for social research source reddit.',
    });
  });
});

const validPlan = (options: { readonly sourceKey?: string } = {}) => {
  const sourceKey = options.sourceKey ?? 'reddit';

  return {
    intent: {
      topic: 'AI developer tools',
      sources: [sourceKey],
    },
    normalizedTopic: 'AI developer tools',
    window: '30d',
    depth: 'balanced',
    goal: 'research',
    lanes: [
      {
        laneId: `${sourceKey}:general:ai-developer-tools`,
        sourceKey,
        kind: 'general',
        operation: 'search',
        query: 'AI developer tools',
        priority: 100,
        maxItems: 40,
        budgetWeight: 1,
        reason: 'primary topic search',
      },
    ],
    budgets: [
      {
        sourceKey,
        maxLanes: 6,
        maxItemsPerLane: 40,
        includeEnrichment: true,
      },
    ],
    warnings: [],
  } as const;
};

const executionScope = () => ({
  tenantId: tenantId('tenant-policy-test'),
  workspaceId: workspaceId('workspace-policy-test'),
  scanJobId: 'scan-policy-test',
  sourceBindingIdBySource: {
    reddit: 'binding-reddit',
  },
});
