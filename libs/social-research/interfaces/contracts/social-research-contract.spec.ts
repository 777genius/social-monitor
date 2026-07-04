import { buildSocialResearchContract } from './social-research-contract';

describe('buildSocialResearchContract', () => {
  it('exports a versioned language-neutral contract for all social research tools', () => {
    const contract = buildSocialResearchContract();

    expect(contract).toMatchObject({
      schemaVersion: 1,
      contractId: 'social-research.v1',
      sdkArchitecture: {
        sourceOfTruth: 'libs/social-research',
        mcpPolicy: 'thin_adapter',
        grpcInputPolicy: 'typed_sdk_request_fields_with_json_fallback',
        providerExecutionBoundary: 'SourceFetcherPort',
        executionScopeRequiredFor: ['search_social', 'fetch_thread'],
        publicEntryPoints: {
          core: '@social-monitor/social-research',
          tools: '@social-monitor/social-research/tools',
          mcp: '@social-monitor/social-research/mcp',
          rest: '@social-monitor/social-research/rest',
          grpc: '@social-monitor/social-research/grpc',
        },
      },
    });
    expect(contract.tools.map((tool) => tool.name)).toEqual([
      'search_social',
      'explain_search_plan',
      'fetch_thread',
      'rank_results',
      'list_social_sources',
      'explain_source_readiness',
    ]);
    expect(contract.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'search_social',
          handlerMethod: 'searchSocial',
          sdkOperationId: 'searchRequest',
          requiresExecutionScope: true,
          sideEffects: 'provider_read',
        }),
        expect.objectContaining({
          name: 'explain_search_plan',
          handlerMethod: 'explainSearchPlan',
          sdkOperationId: 'explainSearchRequest',
          requiresExecutionScope: false,
          sideEffects: 'none',
        }),
        expect.objectContaining({
          name: 'list_social_sources',
          handlerMethod: 'listSocialSources',
          sdkOperationId: 'listSources',
          requiresExecutionScope: false,
          sideEffects: 'none',
        }),
        expect.objectContaining({
          name: 'explain_source_readiness',
          handlerMethod: 'explainSourceReadiness',
          sdkOperationId: 'explainSourceReadiness',
          requiresExecutionScope: false,
          sideEffects: 'none',
        }),
      ]),
    );
    expect(contract.tools[0]?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        topic: { type: 'string' },
        execution: { type: 'object' },
      },
    });
    expect(contract.serialization).toEqual({
      dateTime: 'iso_8601_utc_string',
      providerPayloads: 'not_exposed',
    });
    expect(contract.sourceVocabulary).toMatchObject({
      sourceKeyExtensibility: 'open_string',
      builtInSourceKeys: expect.arrayContaining(['reddit', 'x-twitter']),
      acquisitionModes: expect.arrayContaining([
        'official_api',
        'private_collector',
      ]),
      certificationLevels: expect.arrayContaining([
        'fixture_certified',
        'provider_runtime_gated',
      ]),
      laneKinds: expect.arrayContaining([
        'account_posts',
        'thread_enrichment',
        'transcript_enrichment',
        'url_feed',
      ]),
      laneOperations: expect.arrayContaining(['url']),
      quotaModels: expect.arrayContaining(['per_app', 'per_credential']),
      readinessStates: expect.arrayContaining([
        'enabled_beta',
        'provider_only',
      ]),
      requestPresets: expect.arrayContaining(['broad_research', 'trend_scan']),
      accountLaneRecipeSelectors: expect.arrayContaining([
        'same_source_include_mentions',
      ]),
      customLaneStrategyContract: 'SocialSourceLaneStrategy',
    });
    expect(contract.sourceRegistry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'reddit',
          certification: expect.objectContaining({
            level: 'fixture_certified',
            acquisitionMode: 'official_api',
            liveBetaBlocked: true,
          }),
        }),
        expect.objectContaining({
          sourceKey: 'x-twitter',
          certification: expect.objectContaining({
            level: 'provider_runtime_gated',
            runtimeAdapterPolicy: 'private_service_required',
            riskLevel: 'high',
          }),
        }),
      ]),
    );
    expect(contract.models.map((model) => model.name)).toEqual(
      expect.arrayContaining([
        'SocialSearchIntent',
        'SocialResearchRequestInput',
        'SocialSourceCapabilityProfile',
        'SocialSourceRegistryEntry',
        'SocialSourceRegistryEntryList',
        'SocialSourceListInput',
        'SocialSourceProfileInput',
        'SocialSourceReadinessExplanation',
        'SocialSourceReadinessExplanationResult',
        'SocialAccountLaneStrategyRecipe',
        'SocialResearchFailure',
        'SocialResearchTextResult',
        'SocialSearchPlanTrace',
        'SocialSearchPlan',
        'SocialSearchRunTrace',
        'SocialSearchRun',
        'SocialSearchRunResult',
        'SocialThread',
        'SocialThreadResult',
        'RankedSocialSearchItemList',
        'RankedSocialSearchItemListResult',
      ]),
    );
    expect(contract.sdkOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'search',
          inputModel: 'SocialSearchIntent',
          outputModel: 'SocialSearchRun',
          failureModel: 'SocialResearchFailure',
          safeOperationId: 'trySearch',
          safeOutputModel: 'SocialSearchRunResult',
          requiresGateway: true,
          requiresExecutionScope: true,
        }),
        expect.objectContaining({
          operationId: 'searchRequest',
          inputModel: 'SocialResearchRequestInput',
          outputModel: 'SocialSearchRun',
          safeOperationId: 'trySearchRequest',
          safeOutputModel: 'SocialSearchRunResult',
          requiresGateway: true,
          requiresExecutionScope: true,
        }),
        expect.objectContaining({
          operationId: 'rankResults',
          outputModel: 'RankedSocialSearchItemList',
          safeOperationId: 'tryRankResults',
          safeOutputModel: 'RankedSocialSearchItemListResult',
          sideEffects: 'none',
        }),
        expect.objectContaining({
          operationId: 'listSources',
          inputModel: 'SocialSourceListInput',
          outputModel: 'SocialSourceRegistryEntryList',
          requiresGateway: false,
          requiresExecutionScope: false,
          sideEffects: 'none',
        }),
        expect.objectContaining({
          operationId: 'explainSourceReadiness',
          inputModel: 'SocialSourceProfileInput',
          outputModel: 'SocialSourceReadinessExplanation',
          safeOperationId: 'tryExplainSourceReadiness',
          safeOutputModel: 'SocialSourceReadinessExplanationResult',
          requiresGateway: false,
          requiresExecutionScope: false,
        }),
      ]),
    );
  });
});
