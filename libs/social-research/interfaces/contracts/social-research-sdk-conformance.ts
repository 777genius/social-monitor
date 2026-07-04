import {
  socialResearchModelDefinitions,
  socialResearchSdkOperationDefinitions,
  type SocialResearchSdkOperationDefinition,
} from './social-research-model-schemas';
import { buildSocialResearchSdkCases } from './social-research-sdk-cases';

export type SocialResearchSdkConformance = {
  readonly schemaVersion: 1;
  readonly artifactId: 'social-research.sdk-conformance.v1';
  readonly generatedFrom: readonly string[];
  readonly sourceOfTruth: 'libs/social-research';
  readonly contractArtifacts: {
    readonly modelsAndOperations: 'libs/contracts/social-research/social-research.contract.json';
    readonly goldenCases: 'libs/contracts/social-research/social-research.sdk-cases.json';
    readonly languageSdkManifest: 'libs/contracts/social-research/social-research.language-sdk-manifest.json';
    readonly languageSdkConformanceSuite: 'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json';
    readonly languageSdkRunnerContract: 'libs/contracts/social-research/social-research.language-sdk-runner-contract.json';
    readonly typescriptSdkConformanceReport: 'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json';
    readonly pythonSdkConformanceReport: 'libs/contracts/social-research/social-research.python-sdk-conformance-report.json';
  };
  readonly executableGates: readonly string[];
  readonly serialization: {
    readonly dateTime: 'iso_8601_utc_string';
    readonly resultEnvelope: 'discriminated_ok_union';
    readonly unknownSourceKeys: 'preserve_open_string';
    readonly providerPayloads: 'not_exposed';
  };
  readonly boundaries: {
    readonly mcpAdapterPolicy: 'thin_adapter';
    readonly providerExecutionBoundary: 'SourceFetcherPort';
    readonly sourceSpecificCompilation: 'infrastructure_compiler_only';
    readonly domainInputModel: 'SocialSearchIntent';
    readonly ergonomicInputModel: 'SocialResearchRequestInput';
  };
  readonly sourceExtensionContract: {
    readonly sourceKeyModel: 'open_string';
    readonly capabilityProfileModel: 'SocialSourceCapabilityProfile';
    readonly laneStrategyContract: 'SocialSourceLaneStrategy';
    readonly strategyRecipeModel: 'SocialAccountLaneStrategyRecipe';
    readonly plannerOptionFields: readonly [
      'sourceCapabilities',
      'additionalSourceLaneStrategies',
    ];
    readonly transportPolicy: 'custom_lane_strategies_are_sdk_runtime_code_not_transport_json';
    readonly goldenCaseId: string;
  };
  readonly sourceRegistryContract: {
    readonly registryModel: 'SocialSourceRegistryEntry';
    readonly registryArtifact: 'social-research.contract.json#sourceRegistry';
    readonly readinessModel: 'SocialSourceCapabilityProfile.readiness';
    readonly certificationPolicy: 'fixture_certified_is_not_live_beta_ready';
    readonly providerRuntimePolicy: 'provider_runtime_metadata_only_no_provider_clients';
  };
  readonly queryStrategyContract: {
    readonly recipeModel: 'SocialQueryStrategyRecipe';
    readonly strategyContract: 'SocialQueryStrategy';
    readonly plannerOptionFields: readonly ['queryStrategyRecipe'];
    readonly defaultRecipeId: 'default-social-query-strategy-v1';
    readonly transportPolicy: 'recipe_json_only_no_strategy_code';
  };
  readonly rankingContract: {
    readonly recipeModel: 'SocialRankingRecipe';
    readonly qualityRecipeModel: 'SocialItemQualityRecipe';
    readonly rankInputModel: 'RankSocialItemsInput';
    readonly defaultRecipeId: 'default-relevance-first-social-ranking-v1';
    readonly transportPolicy: 'recipe_json_only_no_strategy_code';
  };
  readonly requiredModels: readonly string[];
  readonly requiredOperations: readonly SocialResearchSdkConformanceOperation[];
  readonly goldenCaseIds: readonly string[];
  readonly invariants: readonly SocialResearchSdkConformanceInvariant[];
};

export type SocialResearchSdkConformanceOperation = {
  readonly operationId: string;
  readonly inputModel: string;
  readonly outputModel: string;
  readonly optionsModel?: string;
  readonly safeOperationId?: string;
  readonly safeOutputModel?: string;
  readonly failureModel?: string;
  readonly sideEffects: 'none' | 'provider_read';
  readonly requiresGateway: boolean;
  readonly requiresExecutionScope: boolean;
};

export type SocialResearchSdkConformanceInvariant = {
  readonly invariantId: string;
  readonly requirement: string;
};

export const buildSocialResearchSdkConformance =
  (): SocialResearchSdkConformance => {
    const sdkCases = buildSocialResearchSdkCases();

    return {
      schemaVersion: 1,
      artifactId: 'social-research.sdk-conformance.v1',
      generatedFrom: [
        'libs/social-research/interfaces/contracts/social-research-model-schemas.ts',
        'libs/social-research/interfaces/contracts/social-research-plan-model-schemas.ts',
        'libs/social-research/interfaces/contracts/social-research-source-discovery-model-schemas.ts',
        'libs/social-research/interfaces/contracts/social-research-sdk-cases.ts',
        'libs/social-research/application/social-source-discovery.ts',
      ],
      sourceOfTruth: 'libs/social-research',
      contractArtifacts: {
        modelsAndOperations:
          'libs/contracts/social-research/social-research.contract.json',
        goldenCases:
          'libs/contracts/social-research/social-research.sdk-cases.json',
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
      executableGates: [
        'npm run check:social-research-contract',
        'npm run check:social-research-sdk-conformance',
        'npm run check:architecture',
      ],
      serialization: {
        dateTime: 'iso_8601_utc_string',
        resultEnvelope: 'discriminated_ok_union',
        unknownSourceKeys: 'preserve_open_string',
        providerPayloads: 'not_exposed',
      },
      boundaries: {
        mcpAdapterPolicy: 'thin_adapter',
        providerExecutionBoundary: 'SourceFetcherPort',
        sourceSpecificCompilation: 'infrastructure_compiler_only',
        domainInputModel: 'SocialSearchIntent',
        ergonomicInputModel: 'SocialResearchRequestInput',
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
      requiredModels: socialResearchModelDefinitions.map(
        (definition) => definition.name,
      ),
      requiredOperations: (
        socialResearchSdkOperationDefinitions as readonly SocialResearchSdkOperationDefinition[]
      ).map((operation) => ({
        operationId: operation.operationId,
        inputModel: operation.inputModel,
        outputModel: operation.outputModel,
        ...optionalOperationMetadata('optionsModel', operation.optionsModel),
        ...optionalOperationMetadata(
          'safeOperationId',
          operation.safeOperationId,
        ),
        ...optionalOperationMetadata(
          'safeOutputModel',
          operation.safeOutputModel,
        ),
        ...optionalOperationMetadata('failureModel', operation.failureModel),
        sideEffects: operation.sideEffects,
        requiresGateway: operation.requiresGateway,
        requiresExecutionScope: operation.requiresExecutionScope,
      })),
      goldenCaseIds: sdkCases.cases.map((item) => item.caseId),
      invariants: [
        {
          invariantId: 'sdk_methods_match_operation_metadata',
          requirement:
            'Every language SDK must expose each required operation and safe operation listed in this artifact.',
        },
        {
          invariantId: 'transport_tools_map_to_sdk_operation_catalog',
          requirement:
            'Every transport-facing tool must declare the handler method, SDK operation id, execution-scope requirement and side-effect profile used by MCP/REST/gRPC adapters.',
        },
        {
          invariantId: 'transport_adapters_cover_tool_catalog',
          requirement:
            'MCP, REST and gRPC adapters must expose every tool declared in the shared social research tool catalog.',
        },
        {
          invariantId: 'grpc_preserves_sdk_request_ergonomics',
          requirement:
            'gRPC search and plan requests must expose typed SDK request fields for common source/account/product/community inputs while keeping JSON fallback fields for backward compatibility.',
        },
        {
          invariantId: 'safe_methods_do_not_throw_domain_failures',
          requirement:
            'Safe methods must return the declared result envelope and SocialResearchFailure instead of throwing validation, policy or gateway-required failures.',
        },
        {
          invariantId: 'request_helpers_compile_to_canonical_intent',
          requirement:
            'Ergonomic request helpers must compile to SocialSearchIntent before planning or execution.',
        },
        {
          invariantId: 'request_builder_outputs_serializable_request_input',
          requirement:
            'Language SDK builders must be immutable ergonomic layers that output SocialResearchRequestInput and compile through the canonical SocialSearchIntent path.',
        },
        {
          invariantId: 'source_keys_are_open_strings',
          requirement:
            'Generated SDKs must preserve unknown source keys instead of restricting callers to built-in sources.',
        },
        {
          invariantId: 'source_extensions_use_profiles_and_strategy_ports',
          requirement:
            'New social sources must be added by capability profiles and SocialSourceLaneStrategy implementations. Account-lane extensions should publish SocialAccountLaneStrategyRecipe metadata so generated SDKs can reproduce the behavior without transport-specific code.',
        },
        {
          invariantId: 'source_registry_exposes_certification_metadata',
          requirement:
            'The SDK contract must expose SocialSourceRegistryEntry metadata for built-in and custom sources so clients can distinguish profile-only, fixture-certified, provider-gated and live-beta-ready sources without importing provider runtimes.',
        },
        {
          invariantId: 'source_discovery_operations_are_provider_free',
          requirement:
            'Source discovery SDK and transport operations must read registry metadata only and must not require SourceFetcherPort, credentials or provider payloads.',
        },
        {
          invariantId: 'query_strategy_is_recipe_backed_for_generated_sdks',
          requirement:
            'Semantic query lane compilation must expose a serializable SocialQueryStrategyRecipe and keep strategy code as an in-process SDK extension point.',
        },
        {
          invariantId: 'ranking_strategy_is_recipe_backed_for_generated_sdks',
          requirement:
            'Rank-only workflows must expose a serializable SocialRankingRecipe so generated SDKs, REST, gRPC and MCP can share relevance-first ranking behavior without provider-specific code.',
        },
        {
          invariantId: 'source_neutral_quality_filters_are_recipe_backed',
          requirement:
            'Ranking must expose source-neutral quality scores and recipe-backed quality filters for weak context, weak match, promo and engagement-bait signals without importing provider payloads or relevance adapters.',
        },
        {
          invariantId: 'reddit_planning_uses_bounded_multi_pass_lanes',
          requirement:
            'Reddit planning must combine semantic search, weekly top recall, community listings and bounded top-comment enrichment without putting Reddit API logic in transport adapters.',
        },
        {
          invariantId: 'x_twitter_execution_uses_bounded_multi_query_search',
          requirement:
            'X/Twitter account, mention, product and fallback lanes must execute through bounded multi-query search compilation so provider-specific modes do not leak into SDK or MCP transports.',
        },
        {
          invariantId: 'search_runs_expose_execution_trace',
          requirement:
            'Search execution results must expose stable cache and gateway trace metadata so SDK, REST, gRPC and MCP clients can distinguish cache hits, write-throughs and provider reads.',
        },
        {
          invariantId: 'execution_policy_enforces_source_runtime_readiness',
          requirement:
            'Provider-backed execution must share a source readiness policy based on SocialSourceCapabilityProfile readiness, so deferred or rejected sources cannot be executed through SDK, MCP, REST or gRPC by accident.',
        },
        {
          invariantId: 'planner_exposes_source_readiness_warnings',
          requirement:
            'Plan creation must expose readiness warnings from the same runtime-readiness policy before provider execution starts.',
        },
        {
          invariantId: 'planner_exposes_machine_readable_trace',
          requirement:
            'Plan creation must expose SocialSearchPlanTrace with source selection, strategy availability, capability filtering, lane caps and warning counts so SDK, REST, gRPC and MCP clients can debug planner decisions without provider payloads.',
        },
        {
          invariantId: 'source_specific_runtime_stays_out_of_mcp',
          requirement:
            'Generated SDKs and MCP adapters must not contain provider client, credential, quota or anti-bot logic.',
        },
        {
          invariantId: 'transport_boundaries_are_architecture_checked',
          requirement:
            'The repository architecture gate must reject social-research transport adapters that import provider/runtime infrastructure directly.',
        },
        {
          invariantId: 'golden_cases_are_language_compatibility_tests',
          requirement:
            'Generated SDK test suites must validate all golden cases from social-research.sdk-cases.json.',
        },
        {
          invariantId: 'language_sdk_manifest_covers_required_operations_and_golden_cases',
          requirement:
            'The language SDK manifest must list every target SDK and bind each target to all required operations, safe operations, models and golden cases from this conformance artifact.',
        },
        {
          invariantId: 'language_sdk_conformance_suite_classifies_portable_and_extension_cases',
          requirement:
            'The language SDK conformance suite must classify portable planner, ranker, safe-failure and custom strategy-extension cases so generated SDKs do not claim provider or extension readiness from generic golden cases.',
        },
        {
          invariantId: 'typescript_reference_sdk_executes_language_conformance_suite',
          requirement:
            'The TypeScript reference SDK must emit a passing conformance report for every operation and golden case in the language SDK conformance suite.',
        },
        {
          invariantId: 'language_sdk_runner_contract_defines_report_generation_for_all_targets',
          requirement:
            'The language SDK runner contract must define report artifacts, input artifacts, runner commands and activation criteria for TypeScript and Python without claiming generated SDK readiness before report artifacts exist.',
        },
      ],
    };
  };

const optionalOperationMetadata = <TKey extends string>(
  key: TKey,
  value: string | undefined,
): Partial<Record<TKey, string>> =>
  value === undefined ? {} : ({ [key]: value } as Record<TKey, string>);
