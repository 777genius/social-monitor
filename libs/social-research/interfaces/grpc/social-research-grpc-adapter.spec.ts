import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { Metadata, status } from '@grpc/grpc-js';
import {
  SocialResearchCommunityListing,
  SocialResearchDepth,
  SocialResearchGoal,
  SocialResearchHealthStatus,
  SocialResearchRequestPreset,
  type ExplainSourceReadinessResponse,
  type ExplainSearchPlanResponse,
  type ListSocialSourcesResponse,
  type SearchSocialResponse,
  type SocialResearchHealthResponse,
} from '@social-monitor/contracts/generated/grpc/social_research/v1/social_research';

import type { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';
import { createSocialResearchGrpcService } from './social-research-grpc-adapter';

describe('createSocialResearchGrpcService', () => {
  it('maps SearchSocial requests to SDK tool handlers', async () => {
    const inputs: unknown[] = [];
    const service = createSocialResearchGrpcService({
      async searchSocial(input: unknown) {
        inputs.push(input);

        return {
          plan: {
            normalizedTopic: 'AI agents',
            lanes: [],
            warnings: [],
          },
          items: [],
          warnings: [],
          partial: false,
        };
      },
    } as unknown as SocialResearchToolHandlers);
    const callback = capturingCallback<SearchSocialResponse>();

    service.searchSocial(
      callWith({
        schemaVersion: 1,
        requestId: 'request-1',
        intent: legacyIntent({
          topic: 'AI agents',
          sources: ['reddit'],
          windowJson: '{"days":7}',
          depth: SocialResearchDepth.SOCIAL_RESEARCH_DEPTH_BALANCED,
          goal: SocialResearchGoal.SOCIAL_RESEARCH_GOAL_RESEARCH,
          entitiesJson: '{"keywords":["MCP"]}',
        }),
        planner: {
          defaultSources: [],
          maxLanes: 3,
          sourceLimitsJson: '[{"sourceKey":"reddit","maxLanes":2}]',
          queryStrategyRecipeJson:
            '{"recipeKind":"semantic_query_strategy_v1","recipeId":"grpc-query-v1","phraseMode":"plain"}',
        },
        execution: {
          tenantId: 'tenant-grpc',
          workspaceId: 'workspace-grpc',
          scanJobId: 'scan-grpc',
          correlationId: 'correlation-grpc',
          sourceBindingIdBySource: {
            reddit: 'binding-reddit',
          },
          cursorByLaneId: {},
        },
      }),
      callback,
    );

    await callback.done;
    expect(callback.error).toBeNull();
    expect(inputs).toEqual([
      expect.objectContaining({
        topic: 'AI agents',
        sources: ['reddit'],
        window: { days: 7 },
        depth: 'balanced',
        goal: 'research',
        entities: { keywords: ['MCP'] },
        maxLanes: 3,
        sourceLimits: [{ sourceKey: 'reddit', maxLanes: 2 }],
        queryStrategyRecipe: {
          recipeKind: 'semantic_query_strategy_v1',
          recipeId: 'grpc-query-v1',
          phraseMode: 'plain',
        },
        execution: expect.objectContaining({
          tenantId: 'tenant-grpc',
          workspaceId: 'workspace-grpc',
          sourceBindingIdBySource: {
            reddit: 'binding-reddit',
          },
        }),
      }),
    ]);
    expect(JSON.parse(callback.value?.runJson ?? '{}')).toMatchObject({
      partial: false,
    });
  });

  it('maps typed SDK-friendly SearchSocial fields without JSON entities', async () => {
    const inputs: unknown[] = [];
    const service = createSocialResearchGrpcService({
      async searchSocial(input: unknown) {
        inputs.push(input);

        return {
          plan: {
            normalizedTopic: 'Claude Code MCP',
            lanes: [],
            warnings: [],
          },
          items: [],
          warnings: [],
          partial: false,
        };
      },
    } as unknown as SocialResearchToolHandlers);
    const callback = capturingCallback<SearchSocialResponse>();

    service.searchSocial(
      callWith({
        schemaVersion: 1,
        requestId: 'request-typed',
        intent: {
          topic: 'Claude Code MCP',
          sources: ['reddit', 'x-twitter'],
          windowJson: '',
          window: {
            since: '',
            until: '',
            hours: 0,
            days: 7,
            preset: '',
          },
          depth: SocialResearchDepth.SOCIAL_RESEARCH_DEPTH_BALANCED,
          goal: SocialResearchGoal.SOCIAL_RESEARCH_GOAL_RESEARCH,
          preset:
            SocialResearchRequestPreset.SOCIAL_RESEARCH_REQUEST_PRESET_BROAD_RESEARCH,
          entitiesJson: '',
          accounts: [
            {
              handle: '@openai',
              sourceKey: 'x-twitter',
              includePosts: true,
              includeMentions: true,
            },
          ],
          products: ['Claude Code'],
          keywords: ['MCP'],
          communities: [
            {
              name: 'ClaudeAI',
              sourceKey: 'reddit',
              listings: [
                SocialResearchCommunityListing.SOCIAL_RESEARCH_COMMUNITY_LISTING_TOP,
              ],
            },
          ],
          urls: ['https://example.test/research'],
        },
        planner: undefined,
        execution: {
          tenantId: 'tenant-grpc',
          workspaceId: 'workspace-grpc',
          scanJobId: 'scan-grpc',
          correlationId: '',
          sourceBindingIdBySource: {
            reddit: 'binding-reddit',
            'x-twitter': 'binding-x',
          },
          cursorByLaneId: {},
        },
      }),
      callback,
    );

    await callback.done;
    expect(callback.error).toBeNull();
    expect(inputs).toEqual([
      expect.objectContaining({
        topic: 'Claude Code MCP',
        preset: 'broad_research',
        sources: ['reddit', 'x-twitter'],
        window: { days: 7 },
        accounts: [
          {
            handle: '@openai',
            sourceKey: 'x-twitter',
            includePosts: true,
            includeMentions: true,
          },
        ],
        products: ['Claude Code'],
        keywords: ['MCP'],
        communities: [
          {
            name: 'ClaudeAI',
            sourceKey: 'reddit',
            listings: ['top'],
          },
        ],
        urls: ['https://example.test/research'],
      }),
    ]);
  });

  it('returns the social research contract id from health', async () => {
    const service = createSocialResearchGrpcService(
      {} as SocialResearchToolHandlers,
    );
    const callback = capturingCallback<SocialResearchHealthResponse>();

    service.checkHealth(callWith({ service: 'social-research' }), callback);

    await callback.done;
    expect(callback.value).toEqual({
      status: SocialResearchHealthStatus.SOCIAL_RESEARCH_HEALTH_STATUS_SERVING,
      contractId: 'social-research.v1',
      schemaVersion: 1,
      warnings: [],
    });
  });

  it('maps ListSocialSources requests to SDK tool handlers', async () => {
    const inputs: unknown[] = [];
    const service = createSocialResearchGrpcService({
      listSocialSources(input: unknown) {
        inputs.push(input);

        return {
          sources: [
            {
              sourceKey: 'reddit',
              displayName: 'Reddit',
              capabilityProfile: {
                sourceKey: 'reddit',
                version: 1,
                supportedOperations: ['search'],
              },
              certification: {
                level: 'fixture_certified',
              },
            },
          ],
        };
      },
    } as unknown as SocialResearchToolHandlers);
    const callback = capturingCallback<ListSocialSourcesResponse>();

    service.listSocialSources(
      callWith({
        schemaVersion: 1,
        requestId: 'request-sources',
        inputJson: '{"includeProviderRuntimeGated":false}',
        sourceKeys: ['reddit'],
      }),
      callback,
    );

    await callback.done;
    expect(callback.error).toBeNull();
    expect(inputs).toEqual([
      {
        includeProviderRuntimeGated: false,
        sourceKeys: ['reddit'],
      },
    ]);
    expect(JSON.parse(callback.value?.sourcesJson ?? '[]')).toEqual([
      expect.objectContaining({
        sourceKey: 'reddit',
      }),
    ]);
  });

  it('maps ExplainSourceReadiness requests to SDK tool handlers', async () => {
    const inputs: unknown[] = [];
    const service = createSocialResearchGrpcService({
      explainSourceReadiness(input: unknown) {
        inputs.push(input);

        return {
          source: { sourceKey: 'x-twitter' },
          canPlan: true,
          canExecuteWithDefaultPolicy: false,
          summary: 'X/Twitter is gated.',
          reasons: [],
          warnings: [],
        };
      },
    } as unknown as SocialResearchToolHandlers);
    const callback = capturingCallback<ExplainSourceReadinessResponse>();

    service.explainSourceReadiness(
      callWith({
        schemaVersion: 1,
        requestId: 'request-readiness',
        sourceKey: 'x-twitter',
      }),
      callback,
    );

    await callback.done;
    expect(callback.error).toBeNull();
    expect(inputs).toEqual([{ sourceKey: 'x-twitter' }]);
    expect(JSON.parse(callback.value?.readinessJson ?? '{}')).toMatchObject({
      canExecuteWithDefaultPolicy: false,
      source: {
        sourceKey: 'x-twitter',
      },
    });
  });

  it('rejects requests without the configured service token', async () => {
    const service = createSocialResearchGrpcService(
      {
        async searchSocial() {
          throw new Error('should not execute');
        },
      } as unknown as SocialResearchToolHandlers,
      { serviceToken: 'secret-token' },
    );
    const callback = capturingCallback<SearchSocialResponse>();

    service.searchSocial(
      callWith({
        schemaVersion: 1,
        requestId: 'request-auth',
        intent: legacyIntent({
          topic: 'AI agents',
          sources: ['reddit'],
          windowJson: '',
          depth: SocialResearchDepth.SOCIAL_RESEARCH_DEPTH_BALANCED,
          goal: SocialResearchGoal.SOCIAL_RESEARCH_GOAL_RESEARCH,
          entitiesJson: '',
        }),
        planner: undefined,
        execution: undefined,
      }),
      callback,
    );

    await callback.done;
    expect(callback.error).toMatchObject({
      code: status.UNAUTHENTICATED,
      message: 'Unauthorized',
    });
    expect(callback.value).toBeNull();
  });

  it('accepts the configured bearer service token', async () => {
    const service = createSocialResearchGrpcService(
      {} as SocialResearchToolHandlers,
      { serviceToken: 'secret-token' },
    );
    const metadata = new Metadata();
    metadata.set('authorization', 'Bearer secret-token');
    const callback = capturingCallback<SocialResearchHealthResponse>();

    service.checkHealth(
      callWith({ service: 'social-research' }, metadata),
      callback,
    );

    await callback.done;
    expect(callback.error).toBeNull();
    expect(callback.value).toEqual(
      expect.objectContaining({
        contractId: 'social-research.v1',
        status:
          SocialResearchHealthStatus.SOCIAL_RESEARCH_HEALTH_STATUS_SERVING,
      }),
    );
  });

  it('maps handler errors to gRPC INVALID_ARGUMENT errors', async () => {
    const service = createSocialResearchGrpcService({
      explainSearchPlan() {
        throw new Error('invalid plan');
      },
    } as unknown as SocialResearchToolHandlers);
    const callback = capturingCallback<ExplainSearchPlanResponse>();

    service.explainSearchPlan(
      callWith({
        schemaVersion: 1,
        requestId: 'request-2',
        intent: undefined,
        planner: undefined,
      }),
      callback,
    );

    await callback.done;
    expect(callback.error).toMatchObject({
      code: status.INVALID_ARGUMENT,
      message: 'invalid plan',
    });
    expect(callback.value).toBeNull();
  });
});

const callWith = <TRequest>(
  request: TRequest,
  metadata = new Metadata(),
): ServerUnaryCall<TRequest, unknown> =>
  ({ request, metadata }) as ServerUnaryCall<TRequest, unknown>;

const legacyIntent = (input: {
  readonly topic: string;
  readonly sources: string[];
  readonly windowJson: string;
  readonly depth: SocialResearchDepth;
  readonly goal: SocialResearchGoal;
  readonly entitiesJson: string;
}) => ({
  ...input,
  window: undefined,
  preset:
    SocialResearchRequestPreset.SOCIAL_RESEARCH_REQUEST_PRESET_UNSPECIFIED,
  accounts: [],
  products: [],
  keywords: [],
  communities: [],
  urls: [],
});

const capturingCallback = <TResponse>() => {
  let resolveDone: () => void = () => undefined;
  const callback = ((error, value) => {
    callback.error = error;
    callback.value = value;
    resolveDone();
  }) as sendUnaryData<TResponse> & {
    error: unknown;
    value: TResponse | null | undefined;
    done: Promise<void>;
  };
  callback.error = undefined;
  callback.value = undefined;
  callback.done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  return callback;
};
