import { SocialResearchSdk } from '../../application/social-research-sdk';
import { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';
import { socialResearchToolDefinitions } from '../tools/social-research-tool-schemas';
import {
  socialResearchSdkOperationDefinitions,
  type SocialResearchSdkOperationDefinition,
} from './social-research-model-schemas';
import { buildSocialResearchSdkConformance } from './social-research-sdk-conformance';

describe('buildSocialResearchSdkConformance', () => {
  it('exports required methods, models and invariants for generated language SDKs', () => {
    const conformance = buildSocialResearchSdkConformance();

    expect(conformance).toMatchObject({
      schemaVersion: 1,
      artifactId: 'social-research.sdk-conformance.v1',
      sourceOfTruth: 'libs/social-research',
      contractArtifacts: {
        languageSdkManifest:
          'libs/contracts/social-research/social-research.language-sdk-manifest.json',
        languageSdkConformanceSuite:
          'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
        languageSdkRunnerContract:
          'libs/contracts/social-research/social-research.language-sdk-runner-contract.json',
        typescriptSdkConformanceReport:
          'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
        pythonSdkConformanceReport:
          'libs/contracts/social-research/social-research.python-sdk-conformance-report.json',
      },
      serialization: {
        resultEnvelope: 'discriminated_ok_union',
        unknownSourceKeys: 'preserve_open_string',
      },
      boundaries: {
        mcpAdapterPolicy: 'thin_adapter',
        sourceSpecificCompilation: 'infrastructure_compiler_only',
      },
      sourceExtensionContract: {
        sourceKeyModel: 'open_string',
        capabilityProfileModel: 'SocialSourceCapabilityProfile',
        laneStrategyContract: 'SocialSourceLaneStrategy',
        strategyRecipeModel: 'SocialAccountLaneStrategyRecipe',
        plannerOptionFields: [
          'sourceCapabilities',
          'additionalSourceLaneStrategies',
        ],
        transportPolicy:
          'custom_lane_strategies_are_sdk_runtime_code_not_transport_json',
        goldenCaseId: 'mastodon_extension_request_v1',
      },
      sourceRegistryContract: {
        registryModel: 'SocialSourceRegistryEntry',
        registryArtifact: 'social-research.contract.json#sourceRegistry',
        readinessModel: 'SocialSourceCapabilityProfile.readiness',
        certificationPolicy: 'fixture_certified_is_not_live_beta_ready',
        providerRuntimePolicy:
          'provider_runtime_metadata_only_no_provider_clients',
      },
      queryStrategyContract: {
        recipeModel: 'SocialQueryStrategyRecipe',
        strategyContract: 'SocialQueryStrategy',
        plannerOptionFields: ['queryStrategyRecipe'],
        defaultRecipeId: 'default-social-query-strategy-v1',
        transportPolicy: 'recipe_json_only_no_strategy_code',
      },
      rankingContract: {
        recipeModel: 'SocialRankingRecipe',
        qualityRecipeModel: 'SocialItemQualityRecipe',
        rankInputModel: 'RankSocialItemsInput',
        defaultRecipeId: 'default-relevance-first-social-ranking-v1',
        transportPolicy: 'recipe_json_only_no_strategy_code',
      },
      executableGates: expect.arrayContaining([
        'npm run check:social-research-contract',
        'npm run check:social-research-sdk-conformance',
        'npm run check:architecture',
      ]),
    });
    expect(conformance.requiredModels).toEqual(
      expect.arrayContaining([
        'SocialResearchRequestInput',
        'SocialSearchIntent',
        'SocialResearchFailure',
        'SocialSearchRunResult',
        'SocialSearchRunTrace',
        'SocialSearchPlanTrace',
        'SocialSourceRegistryEntry',
        'SocialSourceReadinessExplanation',
        'SocialAccountLaneStrategyRecipe',
        'SocialQueryStrategyRecipe',
        'SocialRankingRecipe',
        'SocialItemQualityRecipe',
      ]),
    );
    expect(conformance.requiredOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'searchRequest',
          safeOperationId: 'trySearchRequest',
          failureModel: 'SocialResearchFailure',
          requiresGateway: true,
          requiresExecutionScope: true,
        }),
        expect.objectContaining({
          operationId: 'rankResults',
          safeOperationId: 'tryRankResults',
          sideEffects: 'none',
        }),
        expect.objectContaining({
          operationId: 'explainSourceReadiness',
          safeOperationId: 'tryExplainSourceReadiness',
          requiresGateway: false,
          requiresExecutionScope: false,
        }),
      ]),
    );
    expect(conformance.goldenCaseIds).toEqual([
      'reddit_research_request_v1',
      'x_account_recall_request_v1',
      'mastodon_extension_request_v1',
      'ranking_quality_recipe_request_v1',
      'invalid_empty_topic_failure_v1',
    ]);
    expect(conformance.invariants.map((item) => item.invariantId)).toEqual(
      expect.arrayContaining([
        'sdk_methods_match_operation_metadata',
        'transport_tools_map_to_sdk_operation_catalog',
        'transport_adapters_cover_tool_catalog',
        'grpc_preserves_sdk_request_ergonomics',
        'safe_methods_do_not_throw_domain_failures',
        'request_builder_outputs_serializable_request_input',
        'source_keys_are_open_strings',
        'source_extensions_use_profiles_and_strategy_ports',
        'source_registry_exposes_certification_metadata',
        'source_discovery_operations_are_provider_free',
        'query_strategy_is_recipe_backed_for_generated_sdks',
        'ranking_strategy_is_recipe_backed_for_generated_sdks',
        'source_neutral_quality_filters_are_recipe_backed',
        'reddit_planning_uses_bounded_multi_pass_lanes',
        'x_twitter_execution_uses_bounded_multi_query_search',
        'search_runs_expose_execution_trace',
        'execution_policy_enforces_source_runtime_readiness',
        'planner_exposes_source_readiness_warnings',
        'planner_exposes_machine_readable_trace',
        'source_specific_runtime_stays_out_of_mcp',
        'transport_boundaries_are_architecture_checked',
        'golden_cases_are_language_compatibility_tests',
        'language_sdk_manifest_covers_required_operations_and_golden_cases',
        'language_sdk_conformance_suite_classifies_portable_and_extension_cases',
        'typescript_reference_sdk_executes_language_conformance_suite',
        'language_sdk_runner_contract_defines_report_generation_for_all_targets',
      ]),
    );
  });

  it('keeps SDK operation metadata aligned with the TypeScript SDK surface', () => {
    const operations =
      socialResearchSdkOperationDefinitions as readonly SocialResearchSdkOperationDefinition[];

    for (const operation of operations) {
      expectSdkMethod(operation.operationId);

      if (operation.safeOperationId !== undefined) {
        expectSdkMethod(operation.safeOperationId);
      }
    }
  });

  it('keeps transport tool catalog aligned with handlers and SDK operations', () => {
    const operationIds = new Set(
      (
        socialResearchSdkOperationDefinitions as readonly SocialResearchSdkOperationDefinition[]
      ).map((operation) => operation.operationId),
    );

    expect(socialResearchToolDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'search_social',
          handlerMethod: 'searchSocial',
          sdkOperationId: 'searchRequest',
          requiresExecutionScope: true,
          sideEffects: 'provider_read',
        }),
        expect.objectContaining({
          name: 'rank_results',
          handlerMethod: 'rankResults',
          sdkOperationId: 'rankResults',
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

    for (const tool of socialResearchToolDefinitions) {
      expect(operationIds.has(tool.sdkOperationId)).toBe(true);
      expect(
        typeof Reflect.get(
          SocialResearchToolHandlers.prototype,
          tool.handlerMethod,
        ),
      ).toBe('function');
    }
  });
});

const expectSdkMethod = (methodName: string): void => {
  expect(typeof Reflect.get(SocialResearchSdk.prototype, methodName)).toBe(
    'function',
  );
};
