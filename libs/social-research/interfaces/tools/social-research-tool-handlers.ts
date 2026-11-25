import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  SocialResearchExecutionPolicyPort,
  SocialResearchResultCachePort,
} from '../../application/contracts/social-research-execution-policy';
import type {
  SocialResearchExecutionScope,
  SocialResearchGateway,
} from '../../application/contracts/social-research-gateway';
import {
  SocialResearchSdk,
  type SocialResearchSearchOptions,
} from '../../application/social-research-sdk';
import type { SocialSourceReadinessExplanation } from '../../application/social-source-discovery';
import { createSocialSearchIntent } from '../../application/social-research-request';
import type { SocialSearchItem } from '../../domain/entities/social-search-item';
import type { SocialSearchIntent } from '../../domain/value-objects/social-search-intent';
import type { SocialSourceRegistryEntry } from '../../domain/value-objects/social-source-registry';
import type { SocialSearchPlannerOptions } from '../../domain/policies/social-search-planner';
import type { RankSocialItemsInput } from '../../domain/policies/social-item-ranker';
import {
  explainSourceReadinessToolInputSchema,
  explainSearchPlanToolInputSchema,
  fetchThreadToolInputSchema,
  listSocialSourcesToolInputSchema,
  rankResultsToolInputSchema,
  searchSocialToolInputSchema,
  type ExplainSearchPlanToolInput,
  type FetchThreadToolInput,
  type ListSocialSourcesToolInput,
  type RankResultsToolInput,
  type SearchSocialToolInput,
  type SocialResearchExecutionToolInput,
} from './social-research-tool-schemas';
import {
  serializePlan,
  serializeRankedItems,
  serializeSearchRun,
  serializeThread,
  type SerializedRankedSocialSearchItem,
  type SerializedSocialSearchPlan,
  type SerializedSocialSearchRun,
  type SerializedSocialThread,
} from './social-research-tool-serializers';

export type SocialResearchToolHandlerDependencies = {
  readonly sdk?: SocialResearchSdk;
  readonly gateway?: SocialResearchGateway;
  readonly defaultExecutionScope?: SocialResearchExecutionScope;
  readonly defaultPlannerOptions?: SocialSearchPlannerOptions;
  readonly executionPolicy?: SocialResearchExecutionPolicyPort;
  readonly resultCache?: SocialResearchResultCachePort;
  readonly sourceRegistry?: readonly SocialSourceRegistryEntry[];
};

export type ExplainSearchPlanToolResult = {
  readonly plan: SerializedSocialSearchPlan;
  readonly explanation: string;
};

export type ListSocialSourcesToolResult = {
  readonly sources: readonly SocialSourceRegistryEntry[];
};

export class SocialResearchToolHandlers {
  private readonly sdk: SocialResearchSdk;

  constructor(dependencies: SocialResearchToolHandlerDependencies = {}) {
    this.sdk =
      dependencies.sdk ??
      new SocialResearchSdk({
        gateway: dependencies.gateway,
        defaultExecutionScope: dependencies.defaultExecutionScope,
        defaultPlannerOptions: dependencies.defaultPlannerOptions,
        executionPolicy: dependencies.executionPolicy,
        resultCache: dependencies.resultCache,
        sourceRegistry: dependencies.sourceRegistry,
      });
  }

  async searchSocial(input: unknown): Promise<SerializedSocialSearchRun> {
    const parsed = searchSocialToolInputSchema.parse(input);
    const run = await this.sdk.search(
      toIntent(parsed),
      toSearchOptions(parsed),
    );

    return serializeSearchRun(run);
  }

  explainSearchPlan(input: unknown): ExplainSearchPlanToolResult {
    const parsed = explainSearchPlanToolInputSchema.parse(input);
    const result = this.sdk.createSearchPlan(
      toIntent(parsed),
      toPlannerOptions(parsed),
    );

    if (!result.ok) {
      throw new Error(result.errors.map((error) => error.message).join('; '));
    }

    return {
      plan: serializePlan(result.plan),
      explanation: this.sdk.explainPlan(result.plan),
    };
  }

  async fetchThread(input: unknown): Promise<SerializedSocialThread> {
    const parsed = fetchThreadToolInputSchema.parse(input);
    const thread = await this.sdk.fetchThread(toFetchThreadCommand(parsed));

    return serializeThread(thread);
  }

  rankResults(input: unknown): readonly SerializedRankedSocialSearchItem[] {
    const parsed = rankResultsToolInputSchema.parse(input);

    return serializeRankedItems(this.sdk.rankResults(toRankInput(parsed)));
  }

  listSocialSources(input: unknown): ListSocialSourcesToolResult {
    const parsed = listSocialSourcesToolInputSchema.parse(input ?? {});

    return {
      sources: this.sdk.listSources(toSourceListInput(parsed)),
    };
  }

  explainSourceReadiness(input: unknown): SocialSourceReadinessExplanation {
    const parsed = explainSourceReadinessToolInputSchema.parse(input);

    return this.sdk.explainSourceReadiness(parsed);
  }
}

const toIntent = (
  input: SearchSocialToolInput | ExplainSearchPlanToolInput,
): SocialSearchIntent =>
  createSocialSearchIntent({
    topic: input.topic,
    preset: input.preset,
    sources: input.sources,
    window: input.window,
    depth: input.depth,
    goal: input.goal,
    accounts: mergeToolValues(
      input.accounts,
      input.handles,
      input.entities?.handles,
    ),
    products: mergeToolValues(input.products, input.entities?.products),
    keywords: mergeToolValues(input.keywords, input.entities?.keywords),
    communities: mergeToolValues(
      input.communities,
      input.entities?.communities,
    ),
    urls: mergeToolValues(input.urls, input.entities?.urls),
  });

const toPlannerOptions = (
  input: SearchSocialToolInput | ExplainSearchPlanToolInput,
): SocialSearchPlannerOptions => ({
  defaultSources: input.defaultSources,
  maxLanes: input.maxLanes,
  sourceLimits: input.sourceLimits,
  sourceCapabilities: input.sourceCapabilities,
  disableBuiltInSourceCapabilities: input.disableBuiltInSourceCapabilities,
  queryStrategyRecipe: input.queryStrategyRecipe,
  executionAllowedRuntimeReadiness: input.executionAllowedRuntimeReadiness,
  warnWhenSourceReadinessMissing: input.warnWhenSourceReadinessMissing,
});

const toSearchOptions = (
  input: SearchSocialToolInput,
): SocialResearchSearchOptions => ({
  ...toPlannerOptions(input),
  execution:
    input.execution === undefined
      ? undefined
      : toExecutionScope(input.execution),
});

const toExecutionScope = (
  input: SocialResearchExecutionToolInput | undefined,
): SocialResearchExecutionScope => {
  if (input === undefined) {
    throw new Error('Execution scope is required.');
  }

  return {
    tenantId: tenantId(input.tenantId),
    workspaceId: workspaceId(input.workspaceId),
    scanJobId: input.scanJobId,
    correlationId: input.correlationId,
    sourceBindingIdBySource: input.sourceBindingIdBySource,
    cursorByLaneId: input.cursorByLaneId,
  };
};

const toFetchThreadCommand = (input: FetchThreadToolInput) => ({
  canonicalUrl: input.canonicalUrl,
  sourceKey: input.sourceKey,
  externalId: input.externalId,
  maxDepth: input.maxDepth,
  execution:
    input.execution === undefined
      ? undefined
      : toExecutionScope(input.execution),
});

const mergeToolValues = <T>(
  ...values: readonly (T | readonly T[] | undefined)[]
): T | readonly T[] | undefined => {
  const merged = values.flatMap((value) => asArray(value));

  return merged.length === 0 ? undefined : merged;
};

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] => {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
};

const toRankInput = (input: RankResultsToolInput): RankSocialItemsInput => ({
  intent: {
    topic: input.topic,
    goal: input.goal,
    entities: input.entities,
  },
  items: input.items.map(toSearchItem),
  rankingRecipe: input.rankingRecipe,
  limit: input.limit,
  now: input.now === undefined ? undefined : new Date(input.now),
});

const toSearchItem = (
  item: RankResultsToolInput['items'][number],
): SocialSearchItem => ({
  ...item,
  publishedAt:
    item.publishedAt === undefined ? undefined : new Date(item.publishedAt),
});

const toSourceListInput = (
  input: ListSocialSourcesToolInput,
): ListSocialSourcesToolInput => ({
  sourceKeys: input.sourceKeys,
  includeProfileOnly: input.includeProfileOnly,
  includeProviderRuntimeGated: input.includeProviderRuntimeGated,
  includeRejected: input.includeRejected,
});
