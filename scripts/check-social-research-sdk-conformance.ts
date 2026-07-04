import { readFileSync } from 'node:fs';

import {
  builtInSocialSourceCapabilityProfiles,
  createSocialResearchRequestBuilder,
  planSocialSearch,
  SocialResearchSdk,
} from '@social-monitor/social-research';
import {
  buildSocialResearchContract,
  buildSocialResearchSdkCases,
  buildSocialResearchSdkConformance,
  socialResearchSdkOperationDefinitions,
  type SocialResearchSdkOperationDefinition,
} from '@social-monitor/social-research/contracts';
import { createDefaultSourceFetcherLaneExecutionCompiler } from '@social-monitor/social-research/ingestion';
import { createSocialResearchGrpcService } from '@social-monitor/social-research/grpc';
import {
  registerSocialResearchMcpTools,
  type SocialResearchMcpToolConfig,
  type SocialResearchMcpToolRegistrar,
  type SocialResearchMcpToolResult,
} from '@social-monitor/social-research/mcp';
import { SocialResearchController } from '@social-monitor/social-research/rest';
import {
  SocialResearchToolHandlers,
  socialResearchToolDefinitions,
} from '@social-monitor/social-research/tools';
import { checkSocialResearchLanguageSdkConformance } from './lib/social-research-sdk-conformance-language';

const violations: string[] = [];
const sdkOperations =
  socialResearchSdkOperationDefinitions as readonly SocialResearchSdkOperationDefinition[];
const sdkOperationById = new Map(
  sdkOperations.map((operation) => [operation.operationId, operation]),
);
const contract = buildSocialResearchContract();
const conformance = buildSocialResearchSdkConformance();
const sdkCases = buildSocialResearchSdkCases();

for (const operation of sdkOperations) {
  requireMethod(
    SocialResearchSdk.prototype,
    operation.operationId,
    `SocialResearchSdk.${operation.operationId}`,
  );

  if (operation.safeOperationId !== undefined) {
    requireMethod(
      SocialResearchSdk.prototype,
      operation.safeOperationId,
      `SocialResearchSdk.${operation.safeOperationId}`,
    );
  }
}

for (const tool of socialResearchToolDefinitions) {
  requireMethod(
    SocialResearchToolHandlers.prototype,
    tool.handlerMethod,
    `SocialResearchToolHandlers.${tool.handlerMethod}`,
  );

  const sdkOperation = sdkOperationById.get(tool.sdkOperationId);
  if (sdkOperation === undefined) {
    addViolation(
      `${tool.name} maps to missing SDK operation ${tool.sdkOperationId}`,
    );
    continue;
  }

  if (tool.sideEffects !== sdkOperation.sideEffects) {
    addViolation(
      `${tool.name} sideEffects=${tool.sideEffects} does not match SDK operation ${sdkOperation.operationId} sideEffects=${sdkOperation.sideEffects}`,
    );
  }

  if (tool.requiresExecutionScope !== sdkOperation.requiresExecutionScope) {
    addViolation(
      `${tool.name} requiresExecutionScope=${tool.requiresExecutionScope} does not match SDK operation ${sdkOperation.operationId} requiresExecutionScope=${sdkOperation.requiresExecutionScope}`,
    );
  }

  const contractTool = contract.tools.find((item) => item.name === tool.name);
  if (contractTool === undefined) {
    addViolation(`${tool.name} is missing from social research contract tools`);
    continue;
  }

  assertEqual(
    contractTool.handlerMethod,
    tool.handlerMethod,
    `${tool.name} contract handlerMethod`,
  );
  assertEqual(
    contractTool.sdkOperationId,
    tool.sdkOperationId,
    `${tool.name} contract sdkOperationId`,
  );
  assertEqual(
    contractTool.requiresExecutionScope,
    tool.requiresExecutionScope,
    `${tool.name} contract requiresExecutionScope`,
  );
  assertEqual(
    contractTool.sideEffects,
    tool.sideEffects,
    `${tool.name} contract sideEffects`,
  );
}

assertArrayEqual(
  contract.sdkArchitecture.executionScopeRequiredFor,
  socialResearchToolDefinitions
    .filter((tool) => tool.requiresExecutionScope)
    .map((tool) => tool.name),
  'contract.sdkArchitecture.executionScopeRequiredFor',
);
assertArrayIncludes(
  conformance.executableGates,
  'npm run check:social-research-sdk-conformance',
  'conformance.executableGates',
);
assertInvariant('transport_tools_map_to_sdk_operation_catalog');
assertInvariant('transport_adapters_cover_tool_catalog');
assertInvariant('grpc_preserves_sdk_request_ergonomics');
assertInvariant('request_builder_outputs_serializable_request_input');
assertInvariant('source_extensions_use_profiles_and_strategy_ports');
assertInvariant('source_registry_exposes_certification_metadata');
assertInvariant('source_discovery_operations_are_provider_free');
assertInvariant('query_strategy_is_recipe_backed_for_generated_sdks');
assertInvariant('ranking_strategy_is_recipe_backed_for_generated_sdks');
assertInvariant('source_neutral_quality_filters_are_recipe_backed');
assertInvariant('reddit_planning_uses_bounded_multi_pass_lanes');
assertInvariant('x_twitter_execution_uses_bounded_multi_query_search');
assertInvariant('search_runs_expose_execution_trace');
assertInvariant('execution_policy_enforces_source_runtime_readiness');
assertInvariant('planner_exposes_source_readiness_warnings');
assertInvariant('planner_exposes_machine_readable_trace');
assertInvariant('transport_boundaries_are_architecture_checked');
assertInvariant('language_sdk_manifest_covers_required_operations_and_golden_cases');
assertInvariant('language_sdk_conformance_suite_classifies_portable_and_extension_cases');
assertInvariant('typescript_reference_sdk_executes_language_conformance_suite');

assertTransportAdaptersCoverToolCatalog();
assertSourceExtensionContract();
assertSourceRegistryContract();
assertRequestBuilderContract();
assertRedditMultiPassGoldenCase();
assertXTwitterMultiQueryExecutionContract();
assertQueryStrategyContract();
assertRankingStrategyContract();
assertRankingQualityGoldenCase();
addViolations(
  checkSocialResearchLanguageSdkConformance({
    conformance,
    sdkCases,
  }),
);
assertGrpcProtoContract();
assertRestOpenApiContract();

if (violations.length > 0) {
  console.error('Social research SDK conformance failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Social research SDK conformance OK');

function requireMethod(
  target: object,
  methodName: string,
  label: string,
): void {
  if (typeof Reflect.get(target, methodName) !== 'function') {
    addViolation(`${label} is not a function`);
  }
}

function assertInvariant(invariantId: string): void {
  if (
    !conformance.invariants.some((item) => item.invariantId === invariantId)
  ) {
    addViolation(`conformance invariant is missing: ${invariantId}`);
  }
}

function assertTransportAdaptersCoverToolCatalog(): void {
  const toolNames = socialResearchToolDefinitions.map((tool) => tool.name);
  const handlerMethods = socialResearchToolDefinitions.map(
    (tool) => tool.handlerMethod,
  );

  const registeredMcpToolNames: string[] = [];
  const registrar: SocialResearchMcpToolRegistrar = {
    registerTool(
      name: string,
      _config: SocialResearchMcpToolConfig,
      _handler: (
        input: unknown,
        extra?: unknown,
      ) => Promise<SocialResearchMcpToolResult>,
    ): void {
      registeredMcpToolNames.push(name);
    },
  };
  registerSocialResearchMcpTools(registrar, {
    handlers: {} as SocialResearchToolHandlers,
  });
  assertArrayEqual(
    registeredMcpToolNames,
    toolNames,
    'MCP registered tool names',
  );

  const grpcService = createSocialResearchGrpcService(
    {} as SocialResearchToolHandlers,
  );
  for (const methodName of [...handlerMethods, 'checkHealth']) {
    requireMethod(grpcService, methodName, `gRPC service.${methodName}`);
  }

  const restMethodByToolName: Record<string, string> = {
    search_social: 'search',
    explain_search_plan: 'explainPlan',
    fetch_thread: 'fetchThread',
    rank_results: 'rank',
    list_social_sources: 'listSources',
    explain_source_readiness: 'explainSourceReadiness',
  };
  assertObjectKeys(
    restMethodByToolName,
    toolNames,
    'REST method map tool coverage',
  );
  for (const [toolName, methodName] of Object.entries(restMethodByToolName)) {
    requireMethod(
      SocialResearchController.prototype,
      methodName,
      `REST controller method for ${toolName}`,
    );
  }
}

function assertSourceExtensionContract(): void {
  assertEqual(
    conformance.sourceExtensionContract.sourceKeyModel,
    'open_string',
    'conformance.sourceExtensionContract.sourceKeyModel',
  );
  assertEqual(
    conformance.sourceExtensionContract.capabilityProfileModel,
    'SocialSourceCapabilityProfile',
    'conformance.sourceExtensionContract.capabilityProfileModel',
  );
  assertEqual(
    conformance.sourceExtensionContract.laneStrategyContract,
    'SocialSourceLaneStrategy',
    'conformance.sourceExtensionContract.laneStrategyContract',
  );
  assertEqual(
    conformance.sourceExtensionContract.strategyRecipeModel,
    'SocialAccountLaneStrategyRecipe',
    'conformance.sourceExtensionContract.strategyRecipeModel',
  );
  assertArrayEqual(
    conformance.sourceExtensionContract.plannerOptionFields,
    ['sourceCapabilities', 'additionalSourceLaneStrategies'],
    'conformance.sourceExtensionContract.plannerOptionFields',
  );
  assertEqual(
    conformance.sourceExtensionContract.transportPolicy,
    'custom_lane_strategies_are_sdk_runtime_code_not_transport_json',
    'conformance.sourceExtensionContract.transportPolicy',
  );
  assertEqual(
    contract.sourceVocabulary.sourceKeyExtensibility,
    'open_string',
    'contract.sourceVocabulary.sourceKeyExtensibility',
  );
  assertEqual(
    contract.sourceVocabulary.customLaneStrategyContract,
    'SocialSourceLaneStrategy',
    'contract.sourceVocabulary.customLaneStrategyContract',
  );
  assertArrayIncludes(
    contract.sourceVocabulary.accountLaneRecipeSelectors,
    'same_source_include_mentions',
    'contract.sourceVocabulary.accountLaneRecipeSelectors',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialAccountLaneStrategyRecipe',
    'contract.models',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialSearchRunTrace',
    'contract.models',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialSearchPlanTrace',
    'contract.models',
  );

  const extensionCase = sdkCases.cases.find(
    (item) => item.caseId === conformance.sourceExtensionContract.goldenCaseId,
  );
  if (extensionCase === undefined) {
    addViolation(
      `source extension golden case is missing: ${conformance.sourceExtensionContract.goldenCaseId}`,
    );
    return;
  }
  if (extensionCase.kind !== 'source_extension_request_to_plan') {
    addViolation(
      `${extensionCase.caseId} must be source_extension_request_to_plan`,
    );
    return;
  }

  assertEqual(
    extensionCase.sourceExtensionContract.transportPolicy,
    'strategy_code_is_sdk_runtime_extension_not_transport_json',
    `${extensionCase.caseId} transport policy`,
  );
  assertEqual(
    extensionCase.sourceExtensionContract.capabilityProfile.sourceKey,
    'mastodon',
    `${extensionCase.caseId} capability sourceKey`,
  );
  assertEqual(
    extensionCase.sourceExtensionContract.laneStrategy.contract,
    'SocialSourceLaneStrategy',
    `${extensionCase.caseId} lane strategy contract`,
  );
  const recipe = extensionCase.sourceExtensionContract.laneStrategy.recipes[0];
  if (recipe === undefined) {
    addViolation(`${extensionCase.caseId} must publish a lane strategy recipe`);
    return;
  }
  assertEqual(
    recipe.recipeKind,
    'account_lane_template',
    `${extensionCase.caseId} recipe kind`,
  );
  assertEqual(
    recipe.queryTemplate,
    '@{handle}',
    `${extensionCase.caseId} recipe queryTemplate`,
  );
  assertArrayIncludes(
    extensionCase.expectedIntent.sources ?? [],
    'mastodon',
    `${extensionCase.caseId} expectedIntent.sources`,
  );
  if (
    !extensionCase.expectedPlan.lanes.some(
      (lane) =>
        lane.sourceKey === 'mastodon' &&
        lane.kind === 'account_mentions' &&
        lane.operation === 'mention_search',
    )
  ) {
    addViolation(
      `${extensionCase.caseId} must include mastodon account_mentions lane`,
    );
  }
}

function assertSourceRegistryContract(): void {
  assertEqual(
    conformance.sourceRegistryContract.registryModel,
    'SocialSourceRegistryEntry',
    'conformance.sourceRegistryContract.registryModel',
  );
  assertEqual(
    conformance.sourceRegistryContract.certificationPolicy,
    'fixture_certified_is_not_live_beta_ready',
    'conformance.sourceRegistryContract.certificationPolicy',
  );
  assertEqual(
    conformance.sourceRegistryContract.providerRuntimePolicy,
    'provider_runtime_metadata_only_no_provider_clients',
    'conformance.sourceRegistryContract.providerRuntimePolicy',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialSourceRegistryEntry',
    'contract.models',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialSourceReadinessExplanation',
    'contract.models',
  );
  assertArrayIncludes(
    contract.sdkOperations.map((operation) => operation.operationId),
    'listSources',
    'contract.sdkOperations',
  );
  assertArrayIncludes(
    contract.sdkOperations.map((operation) => operation.operationId),
    'explainSourceReadiness',
    'contract.sdkOperations',
  );
  assertArrayEqual(
    contract.sourceRegistry.map((entry) => entry.sourceKey).sort(),
    builtInSocialSourceCapabilityProfiles
      .map((profile) => profile.sourceKey)
      .sort(),
    'contract.sourceRegistry source keys',
  );

  const bySource = new Map(
    contract.sourceRegistry.map((entry) => [entry.sourceKey, entry]),
  );
  const reddit = bySource.get('reddit');
  assertEqual(
    reddit?.certification.level,
    'fixture_certified',
    'sourceRegistry.reddit.certification.level',
  );
  assertEqual(
    reddit?.certification.runtimeReadiness,
    'fixture_ready',
    'sourceRegistry.reddit.certification.runtimeReadiness',
  );
  assertEqual(
    reddit?.certification.liveBetaBlocked,
    true,
    'sourceRegistry.reddit.certification.liveBetaBlocked',
  );

  const xTwitter = bySource.get('x-twitter');
  assertEqual(
    xTwitter?.certification.level,
    'provider_runtime_gated',
    'sourceRegistry.x-twitter.certification.level',
  );
  assertEqual(
    xTwitter?.certification.runtimeAdapterPolicy,
    'private_service_required',
    'sourceRegistry.x-twitter.certification.runtimeAdapterPolicy',
  );
  assertEqual(
    xTwitter?.certification.riskLevel,
    'high',
    'sourceRegistry.x-twitter.certification.riskLevel',
  );
}

function assertRequestBuilderContract(): void {
  const builder = createSocialResearchRequestBuilder(
    'AI agents MCP Claude Code reliability',
  )
    .preset('broad_research')
    .source('reddit')
    .source('x-twitter')
    .account('@OpenAI', {
      sourceKey: 'x-twitter',
      includePosts: true,
      includeMentions: true,
    })
    .community('ClaudeAI', {
      sourceKey: 'reddit',
      listings: ['top'],
    })
    .product('Claude Code');

  const requestInput = builder.build();
  assertArrayEqual(
    valuesArray(requestInput.sources),
    ['reddit', 'x-twitter'],
    'request builder sources',
  );
  const account = valuesArray(requestInput.accounts)[0];
  if (typeof account !== 'object' || account.handle !== '@OpenAI') {
    addViolation('request builder account handle expected @OpenAI');
  }

  const planResult = planSocialSearch(builder.toIntent());
  if (!planResult.ok) {
    addViolation('request builder must compile to a valid canonical intent');
  }
}

function assertRedditMultiPassGoldenCase(): void {
  const redditCase = sdkCases.cases.find(
    (item) => item.caseId === 'reddit_research_request_v1',
  );
  if (redditCase === undefined || redditCase.kind !== 'request_to_plan') {
    addViolation('reddit_research_request_v1 golden case is missing');
    return;
  }

  const lanes = redditCase.expectedPlan.lanes;
  const hasWeeklyTopSearch = lanes.some(
    (lane) =>
      lane.sourceKey === 'reddit' &&
      lane.kind === 'search_variant' &&
      lane.parameters?.searchSort === 'top' &&
      lane.parameters.searchTime === 'week',
  );
  const hasBoundedTopComments = lanes.some(
    (lane) =>
      lane.sourceKey === 'reddit' &&
      lane.kind === 'thread_enrichment' &&
      lane.maxItems <= 10 &&
      lane.parameters?.commentSort === 'top',
  );

  if (!hasWeeklyTopSearch) {
    addViolation('reddit_research_request_v1 missing weekly top search pass');
  }
  if (!hasBoundedTopComments) {
    addViolation(
      'reddit_research_request_v1 missing bounded top-comment enrichment',
    );
  }
}

function assertXTwitterMultiQueryExecutionContract(): void {
  const result = planSocialSearch({
    topic: 'AI coding agents MCP',
    sources: ['x-twitter'],
    depth: 'balanced',
    entities: {
      handles: ['openai'],
      products: ['Claude Code', 'OpenAI Codex'],
    },
  });

  if (!result.ok) {
    addViolation('x-twitter multi-query golden plan is invalid');
    return;
  }

  const compiled = createDefaultSourceFetcherLaneExecutionCompiler().compile(
    result.plan.lanes,
  );
  const execution = compiled.executions[0];
  if (execution === undefined) {
    addViolation('x-twitter multi-query execution is missing');
    return;
  }

  if (compiled.executions.length !== 1 || compiled.skippedLanes.length !== 0) {
    addViolation('x-twitter lanes must compile to one search execution');
  }
  assertEqual(
    execution.sourceQuery.mode,
    'search',
    'x-twitter compiled sourceQuery.mode',
  );

  const searchQueries = execution.sourceQuery.parameters?.searchQueries;
  if (!Array.isArray(searchQueries)) {
    addViolation('x-twitter compiled searchQueries must be an array');
    return;
  }

  for (const expected of [
    'AI coding agents MCP',
    'from:openai',
    '@openai',
    '"Claude Code" OR "OpenAI Codex"',
  ]) {
    if (!searchQueries.includes(expected)) {
      addViolation(`x-twitter compiled searchQueries missing ${expected}`);
    }
  }
}

function assertQueryStrategyContract(): void {
  assertEqual(
    conformance.queryStrategyContract.recipeModel,
    'SocialQueryStrategyRecipe',
    'conformance.queryStrategyContract.recipeModel',
  );
  assertEqual(
    conformance.queryStrategyContract.strategyContract,
    'SocialQueryStrategy',
    'conformance.queryStrategyContract.strategyContract',
  );
  assertArrayEqual(
    conformance.queryStrategyContract.plannerOptionFields,
    ['queryStrategyRecipe'],
    'conformance.queryStrategyContract.plannerOptionFields',
  );
  assertEqual(
    conformance.queryStrategyContract.transportPolicy,
    'recipe_json_only_no_strategy_code',
    'conformance.queryStrategyContract.transportPolicy',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialQueryStrategyRecipe',
    'contract.models',
  );
}

function assertRankingStrategyContract(): void {
  assertEqual(
    conformance.rankingContract.recipeModel,
    'SocialRankingRecipe',
    'conformance.rankingContract.recipeModel',
  );
  assertEqual(
    conformance.rankingContract.qualityRecipeModel,
    'SocialItemQualityRecipe',
    'conformance.rankingContract.qualityRecipeModel',
  );
  assertEqual(
    conformance.rankingContract.rankInputModel,
    'RankSocialItemsInput',
    'conformance.rankingContract.rankInputModel',
  );
  assertEqual(
    conformance.rankingContract.transportPolicy,
    'recipe_json_only_no_strategy_code',
    'conformance.rankingContract.transportPolicy',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialRankingRecipe',
    'contract.models',
  );
  assertArrayIncludes(
    contract.models.map((model) => model.name),
    'SocialItemQualityRecipe',
    'contract.models',
  );

  const ranked = new SocialResearchSdk().rankResults({
    intent: {
      topic: 'Claude Code MCP server',
      goal: 'trend',
    },
    rankingRecipe: {
      recipeKind: 'social_ranking_recipe_v1',
      recipeId: 'conformance-relevance-heavy-v1',
      weightsByGoal: {
        trend: {
          relevance: 0.9,
          engagement: 0.1,
        },
      },
      engagement: {
        maxScore: 10,
      },
      quality: {
        penalties: {
          low_context: 0,
        },
      },
    },
    items: [
      {
        itemId: 'viral',
        sourceKey: 'reddit',
        canonicalUrl: 'https://example.test/viral',
        title: 'Generic AI discussion',
        body: 'high engagement thread',
        metrics: { likes: 100_000 },
      },
      {
        itemId: 'specific',
        sourceKey: 'reddit',
        canonicalUrl: 'https://example.test/specific',
        title: 'Claude Code MCP server',
        body: 'Claude Code MCP server workflow notes.',
        metrics: { likes: 3 },
      },
    ],
  });

  if (ranked[0]?.item.itemId !== 'specific') {
    addViolation('SocialRankingRecipe must affect SDK rankResults ordering');
  }
  assertEqual(
    ranked[0]?.ranking.recipeId,
    'conformance-relevance-heavy-v1',
    'SocialRankingRecipe ranking.recipeId',
  );

  const qualityRanked = new SocialResearchSdk().rankResults({
    intent: {
      topic: 'Claude Code MCP server',
      goal: 'trend',
    },
    items: [
      {
        itemId: 'promo',
        sourceKey: 'x-twitter',
        canonicalUrl: 'https://example.test/promo',
        title: 'Claude Code MCP server giveaway',
        body: 'Claude Code MCP server giveaway, like and retweet, limited time discount for a sponsored webinar.',
        metrics: { likes: 80_000, reposts: 10_000 },
      },
      {
        itemId: 'useful',
        sourceKey: 'x-twitter',
        canonicalUrl: 'https://example.test/useful',
        title: 'Claude Code MCP server incident notes',
        body: 'Claude Code MCP server regression notes with reproduction steps, affected tool calls, and mitigation details.',
        metrics: { likes: 20 },
      },
    ],
  });

  if (qualityRanked[0]?.item.itemId !== 'useful') {
    addViolation(
      'SocialItemQualityRecipe must downrank source-neutral promo engagement bait',
    );
  }
  if (
    !qualityRanked[1]?.ranking.qualitySignals.includes('engagement_bait') ||
    !qualityRanked[1]?.ranking.qualitySignals.includes('promo_offer')
  ) {
    addViolation('SocialItemQualityRecipe must expose quality signals');
  }
}

function assertRankingQualityGoldenCase(): void {
  assertArrayIncludes(
    sdkCases.sdkOperationsCovered,
    'rankResults',
    'sdkCases.sdkOperationsCovered',
  );
  assertArrayIncludes(
    sdkCases.sdkOperationsCovered,
    'tryRankResults',
    'sdkCases.sdkOperationsCovered',
  );

  const rankingCase = sdkCases.cases.find(
    (item) => item.caseId === 'ranking_quality_recipe_request_v1',
  );
  if (rankingCase === undefined || rankingCase.kind !== 'rank_results') {
    addViolation('ranking_quality_recipe_request_v1 golden case is missing');
    return;
  }

  assertEqual(
    rankingCase.rankInput.rankingRecipe?.recipeId,
    'sdk-golden-quality-ranking-v1',
    'ranking_quality_recipe_request_v1 recipeId',
  );
  assertEqual(
    rankingCase.expectedRankedItems[0]?.item.itemId,
    'useful',
    'ranking_quality_recipe_request_v1 top item',
  );
  assertEqual(
    rankingCase.expectedRankedItems[0]?.ranking.recipeId,
    'sdk-golden-quality-ranking-v1',
    'ranking_quality_recipe_request_v1 ranking recipeId',
  );

  const promoSignals =
    rankingCase.expectedRankedItems[1]?.ranking.qualitySignals ?? [];
  if (
    !promoSignals.includes('engagement_bait') ||
    !promoSignals.includes('promo_offer')
  ) {
    addViolation(
      'ranking_quality_recipe_request_v1 must expose promo quality signals',
    );
  }
}

function assertGrpcProtoContract(): void {
  const proto = readFileSync(
    'libs/contracts/grpc/social_research/v1/social_research.proto',
    'utf8',
  );
  const requiredFragments = [
    'enum SocialResearchRequestPreset',
    'enum SocialResearchCommunityListing',
    'message SocialResearchWindowInput',
    'message SocialResearchAccountRefInput',
    'message SocialResearchCommunityRefInput',
    'string window_json = 3;',
    'string entities_json = 6;',
    'SocialResearchWindowInput window = 7;',
    'SocialResearchRequestPreset preset = 8;',
    'repeated SocialResearchAccountRefInput accounts = 9;',
    'repeated string products = 10;',
    'repeated string keywords = 11;',
    'repeated SocialResearchCommunityRefInput communities = 12;',
    'repeated string urls = 13;',
    'string query_strategy_recipe_json = 4;',
    'string ranking_recipe_json = 9;',
    'rpc ListSocialSources(ListSocialSourcesRequest) returns (ListSocialSourcesResponse);',
    'rpc ExplainSourceReadiness(ExplainSourceReadinessRequest) returns (ExplainSourceReadinessResponse);',
    'string input_json = 3;',
    'string sources_json = 2;',
    'string readiness_json = 2;',
  ];

  for (const fragment of requiredFragments) {
    if (!proto.includes(fragment)) {
      addViolation(
        `gRPC proto missing SDK-friendly input fragment: ${fragment}`,
      );
    }
  }

  assertEqual(
    contract.sdkArchitecture.grpcInputPolicy,
    'typed_sdk_request_fields_with_json_fallback',
    'contract.sdkArchitecture.grpcInputPolicy',
  );
}

function assertRestOpenApiContract(): void {
  const snapshot = JSON.parse(
    readFileSync('libs/contracts/rest/openapi.snapshot.json', 'utf8'),
  ) as OpenApiSnapshot;
  const schemas = snapshot.components?.schemas ?? {};

  for (const schemaName of [
    'SearchSocialRestRequestDto',
    'ExplainSearchPlanRestRequestDto',
  ]) {
    const properties = schemas[schemaName]?.properties;
    if (properties === undefined) {
      addViolation(`OpenAPI schema is missing: ${schemaName}`);
      continue;
    }

    for (const propertyName of [
      'preset',
      'accounts',
      'handles',
      'products',
      'keywords',
      'communities',
      'urls',
      'queryStrategyRecipe',
      'executionAllowedRuntimeReadiness',
      'warnWhenSourceReadinessMissing',
    ]) {
      if (properties[propertyName] === undefined) {
        addViolation(`${schemaName} is missing SDK-friendly ${propertyName}`);
      }
    }
  }

  const rankProperties = schemas.RankSocialResultsRestRequestDto?.properties;
  if (rankProperties?.rankingRecipe === undefined) {
    addViolation('RankSocialResultsRestRequestDto is missing rankingRecipe');
  }

  const paths = snapshot.paths ?? {};
  const restPathByToolName: Record<string, string> = {
    search_social: '/social-research/search',
    explain_search_plan: '/social-research/explain-plan',
    fetch_thread: '/social-research/threads/fetch',
    rank_results: '/social-research/rank',
    list_social_sources: '/social-research/sources/list',
    explain_source_readiness: '/social-research/sources/readiness',
  };
  assertObjectKeys(
    restPathByToolName,
    socialResearchToolDefinitions.map((tool) => tool.name),
    'OpenAPI REST path map tool coverage',
  );
  for (const [toolName, path] of Object.entries(restPathByToolName)) {
    if (paths[path] === undefined) {
      addViolation(`OpenAPI is missing REST path for ${toolName}: ${path}`);
    }
  }
}

function assertEqual<TValue>(
  actual: TValue,
  expected: TValue,
  label: string,
): void {
  if (actual !== expected) {
    addViolation(
      `${label} expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function assertArrayEqual(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((item, index) => item !== expected[index])
  ) {
    addViolation(
      `${label} expected [${expected.join(', ')}], got [${actual.join(', ')}]`,
    );
  }
}

function assertArrayIncludes(
  values: readonly string[],
  expected: string,
  label: string,
): void {
  if (!values.includes(expected)) {
    addViolation(`${label} is missing ${expected}`);
  }
}

function assertObjectKeys(
  object: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  assertArrayEqual(Object.keys(object).sort(), [...expectedKeys].sort(), label);
}

function addViolation(message: string): void {
  violations.push(message);
}

function addViolations(messages: readonly string[]): void {
  violations.push(...messages);
}

function valuesArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

type OpenApiSnapshot = {
  readonly components?: {
    readonly schemas?: Record<
      string,
      {
        readonly properties?: Record<string, unknown>;
      }
    >;
  };
  readonly paths?: Record<string, unknown>;
};
