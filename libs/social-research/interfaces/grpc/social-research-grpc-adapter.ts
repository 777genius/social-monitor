import { status } from '@grpc/grpc-js';
import type {
  sendUnaryData,
  ServerUnaryCall,
  ServiceError,
} from '@grpc/grpc-js';
import {
  SocialResearchCommunityListing,
  SocialResearchDepth,
  SocialResearchGoal,
  SocialResearchHealthStatus,
  SocialResearchRequestPreset,
  type ExplainSourceReadinessRequest,
  type ExplainSourceReadinessResponse,
  type ExplainSearchPlanRequest,
  type ExplainSearchPlanResponse,
  type FetchThreadRequest,
  type FetchThreadResponse,
  type ListSocialSourcesRequest,
  type ListSocialSourcesResponse,
  type RankResultsRequest,
  type RankResultsResponse,
  type SearchSocialRequest,
  type SearchSocialResponse,
  type SocialResearchAccountRefInput,
  type SocialResearchCommunityRefInput,
  type SocialResearchHealthRequest,
  type SocialResearchHealthResponse,
  type SocialResearchServiceServer,
  type SocialResearchWindowInput,
} from '@social-monitor/contracts/generated/grpc/social_research/v1/social_research';

import { buildSocialResearchContract } from '../contracts/social-research-contract';
import type { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';

export type SocialResearchGrpcServiceOptions = {
  readonly serviceToken?: string;
};

export class SocialResearchGrpcAdapter {
  constructor(
    private readonly handlers: SocialResearchToolHandlers,
    private readonly options: SocialResearchGrpcServiceOptions = {},
  ) {}

  searchSocial = (
    call: ServerUnaryCall<SearchSocialRequest, SearchSocialResponse>,
    callback: sendUnaryData<SearchSocialResponse>,
  ): void => {
    if (rejectUnauthorized(call, callback, this.options.serviceToken)) {
      return;
    }

    void unary(callback, async () => ({
      schemaVersion: 1,
      runJson: JSON.stringify(
        await this.handlers.searchSocial(searchInputFromGrpc(call.request)),
      ),
      warnings: [],
    }));
  };

  explainSearchPlan = (
    call: ServerUnaryCall<ExplainSearchPlanRequest, ExplainSearchPlanResponse>,
    callback: sendUnaryData<ExplainSearchPlanResponse>,
  ): void => {
    if (rejectUnauthorized(call, callback, this.options.serviceToken)) {
      return;
    }

    void unary(callback, async () => {
      const result = this.handlers.explainSearchPlan(
        planInputFromGrpc(call.request),
      );

      return {
        schemaVersion: 1,
        planJson: JSON.stringify(result.plan),
        explanation: result.explanation,
        warnings: [],
      };
    });
  };

  fetchThread = (
    call: ServerUnaryCall<FetchThreadRequest, FetchThreadResponse>,
    callback: sendUnaryData<FetchThreadResponse>,
  ): void => {
    if (rejectUnauthorized(call, callback, this.options.serviceToken)) {
      return;
    }

    void unary(callback, async () => ({
      schemaVersion: 1,
      threadJson: JSON.stringify(
        await this.handlers.fetchThread(threadInputFromGrpc(call.request)),
      ),
      warnings: [],
    }));
  };

  rankResults = (
    call: ServerUnaryCall<RankResultsRequest, RankResultsResponse>,
    callback: sendUnaryData<RankResultsResponse>,
  ): void => {
    if (rejectUnauthorized(call, callback, this.options.serviceToken)) {
      return;
    }

    void unary(callback, async () => ({
      schemaVersion: 1,
      rankedItemsJson: JSON.stringify(
        this.handlers.rankResults(rankInputFromGrpc(call.request)),
      ),
    }));
  };

  listSocialSources = (
    call: ServerUnaryCall<ListSocialSourcesRequest, ListSocialSourcesResponse>,
    callback: sendUnaryData<ListSocialSourcesResponse>,
  ): void => {
    if (rejectUnauthorized(call, callback, this.options.serviceToken)) {
      return;
    }

    void unary(callback, () => ({
      schemaVersion: 1,
      sourcesJson: JSON.stringify(
        this.handlers.listSocialSources(listSourcesInputFromGrpc(call.request))
          .sources,
      ),
      warnings: [],
    }));
  };

  explainSourceReadiness = (
    call: ServerUnaryCall<
      ExplainSourceReadinessRequest,
      ExplainSourceReadinessResponse
    >,
    callback: sendUnaryData<ExplainSourceReadinessResponse>,
  ): void => {
    if (rejectUnauthorized(call, callback, this.options.serviceToken)) {
      return;
    }

    void unary(callback, () => ({
      schemaVersion: 1,
      readinessJson: JSON.stringify(
        this.handlers.explainSourceReadiness({
          sourceKey: call.request.sourceKey,
        }),
      ),
      warnings: [],
    }));
  };

  checkHealth = (
    call: ServerUnaryCall<
      SocialResearchHealthRequest,
      SocialResearchHealthResponse
    >,
    callback: sendUnaryData<SocialResearchHealthResponse>,
  ): void => {
    if (rejectUnauthorized(call, callback, this.options.serviceToken)) {
      return;
    }

    const contract = buildSocialResearchContract();
    const response: SocialResearchHealthResponse = {
      status: SocialResearchHealthStatus.SOCIAL_RESEARCH_HEALTH_STATUS_SERVING,
      contractId: contract.contractId,
      schemaVersion: contract.schemaVersion,
      warnings: [],
    };

    callback(null, response);
  };
}

export const createSocialResearchGrpcService = (
  handlers: SocialResearchToolHandlers,
  options: SocialResearchGrpcServiceOptions = {},
): SocialResearchServiceServer => {
  const adapter = new SocialResearchGrpcAdapter(handlers, options);

  return {
    searchSocial: adapter.searchSocial,
    explainSearchPlan: adapter.explainSearchPlan,
    fetchThread: adapter.fetchThread,
    rankResults: adapter.rankResults,
    listSocialSources: adapter.listSocialSources,
    explainSourceReadiness: adapter.explainSourceReadiness,
    checkHealth: adapter.checkHealth,
  };
};

const searchInputFromGrpc = (request: SearchSocialRequest) => ({
  ...planInputFromGrpc(request),
  execution: executionFromGrpc(request.execution),
});

const planInputFromGrpc = (
  request: SearchSocialRequest | ExplainSearchPlanRequest,
) => ({
  topic: request.intent?.topic ?? '',
  preset: presetFromGrpc(request.intent?.preset),
  sources: nonEmptyArray(request.intent?.sources),
  window:
    windowFromGrpc(request.intent?.window) ??
    jsonField(request.intent?.windowJson),
  depth: depthFromGrpc(request.intent?.depth),
  goal: goalFromGrpc(request.intent?.goal),
  entities: jsonField(request.intent?.entitiesJson),
  accounts: accountRefsFromGrpc(request.intent?.accounts),
  products: nonEmptyArray(request.intent?.products),
  keywords: nonEmptyArray(request.intent?.keywords),
  communities: communityRefsFromGrpc(request.intent?.communities),
  urls: nonEmptyArray(request.intent?.urls),
  defaultSources: nonEmptyArray(request.planner?.defaultSources),
  maxLanes: positiveInteger(request.planner?.maxLanes),
  sourceLimits: jsonField(request.planner?.sourceLimitsJson),
  queryStrategyRecipe: jsonField(request.planner?.queryStrategyRecipeJson),
});

const threadInputFromGrpc = (request: FetchThreadRequest) => ({
  canonicalUrl: nonEmpty(request.canonicalUrl),
  sourceKey: nonEmpty(request.sourceKey),
  externalId: nonEmpty(request.externalId),
  maxDepth: positiveInteger(request.maxDepth),
  execution: executionFromGrpc(request.execution),
});

const rankInputFromGrpc = (request: RankResultsRequest) => ({
  topic: request.topic,
  goal: goalFromGrpc(request.goal),
  entities: jsonField(request.entitiesJson),
  rankingRecipe: jsonField(request.rankingRecipeJson),
  items: jsonField(request.itemsJson) ?? [],
  limit: positiveInteger(request.limit),
  now: nonEmpty(request.now),
});

const listSourcesInputFromGrpc = (request: ListSocialSourcesRequest) => {
  const inputJson = jsonField(request.inputJson) as
    | { readonly sourceKeys?: readonly string[] }
    | undefined;

  return {
    ...inputJson,
    sourceKeys: nonEmptyArray(request.sourceKeys) ?? inputJson?.sourceKeys,
  };
};

const executionFromGrpc = (execution: SearchSocialRequest['execution']) =>
  execution === undefined
    ? undefined
    : {
        tenantId: execution.tenantId,
        workspaceId: execution.workspaceId,
        scanJobId: execution.scanJobId,
        correlationId: nonEmpty(execution.correlationId),
        sourceBindingIdBySource: execution.sourceBindingIdBySource,
        cursorByLaneId: emptyRecordToUndefined(execution.cursorByLaneId),
      };

const depthFromGrpc = (
  depth: SocialResearchDepth | undefined,
): string | undefined => {
  switch (depth) {
    case SocialResearchDepth.SOCIAL_RESEARCH_DEPTH_LIGHT:
      return 'light';
    case SocialResearchDepth.SOCIAL_RESEARCH_DEPTH_BALANCED:
      return 'balanced';
    case SocialResearchDepth.SOCIAL_RESEARCH_DEPTH_DEEP:
      return 'deep';
    default:
      return undefined;
  }
};

const goalFromGrpc = (
  goal: SocialResearchGoal | undefined,
): string | undefined => {
  switch (goal) {
    case SocialResearchGoal.SOCIAL_RESEARCH_GOAL_RESEARCH:
      return 'research';
    case SocialResearchGoal.SOCIAL_RESEARCH_GOAL_TREND:
      return 'trend';
    case SocialResearchGoal.SOCIAL_RESEARCH_GOAL_SUPPORT:
      return 'support';
    case SocialResearchGoal.SOCIAL_RESEARCH_GOAL_COMPETITOR:
      return 'competitor';
    case SocialResearchGoal.SOCIAL_RESEARCH_GOAL_SECURITY:
      return 'security';
    default:
      return undefined;
  }
};

const presetFromGrpc = (
  preset: SocialResearchRequestPreset | undefined,
): string | undefined => {
  switch (preset) {
    case SocialResearchRequestPreset.SOCIAL_RESEARCH_REQUEST_PRESET_BROAD_RESEARCH:
      return 'broad_research';
    case SocialResearchRequestPreset.SOCIAL_RESEARCH_REQUEST_PRESET_TREND_SCAN:
      return 'trend_scan';
    case SocialResearchRequestPreset.SOCIAL_RESEARCH_REQUEST_PRESET_SUPPORT_WATCH:
      return 'support_watch';
    case SocialResearchRequestPreset.SOCIAL_RESEARCH_REQUEST_PRESET_COMPETITOR_SCAN:
      return 'competitor_scan';
    default:
      return undefined;
  }
};

const windowFromGrpc = (
  window: SocialResearchWindowInput | undefined,
): string | Record<string, string | number> | undefined => {
  if (window === undefined) {
    return undefined;
  }

  const preset = nonEmpty(window.preset);
  if (preset !== undefined) {
    return preset;
  }

  const value = {
    ...(nonEmpty(window.since) === undefined ? {} : { since: window.since }),
    ...(nonEmpty(window.until) === undefined ? {} : { until: window.until }),
    ...(positiveInteger(window.hours) === undefined
      ? {}
      : { hours: window.hours }),
    ...(positiveInteger(window.days) === undefined
      ? {}
      : { days: window.days }),
  };

  return Object.keys(value).length === 0 ? undefined : value;
};

const accountRefsFromGrpc = (
  accounts: readonly SocialResearchAccountRefInput[] | undefined,
) => {
  const refs: {
    readonly handle: string;
    readonly sourceKey?: string;
    readonly includePosts: boolean;
    readonly includeMentions: boolean;
  }[] = [];

  for (const account of accounts ?? []) {
    const handle = nonEmpty(account.handle);
    if (handle === undefined) {
      continue;
    }

    const sourceKey = nonEmpty(account.sourceKey);
    refs.push({
      handle,
      ...(sourceKey === undefined ? {} : { sourceKey }),
      includePosts: account.includePosts,
      includeMentions: account.includeMentions,
    });
  }

  return refs.length === 0 ? undefined : refs;
};

const communityRefsFromGrpc = (
  communities: readonly SocialResearchCommunityRefInput[] | undefined,
) => {
  const refs: {
    readonly name: string;
    readonly sourceKey?: string;
    readonly listings?: readonly string[];
  }[] = [];

  for (const community of communities ?? []) {
    const name = nonEmpty(community.name);
    if (name === undefined) {
      continue;
    }

    const sourceKey = nonEmpty(community.sourceKey);
    const listings = communityListingsFromGrpc(community.listings);
    refs.push({
      name,
      ...(sourceKey === undefined ? {} : { sourceKey }),
      ...(listings === undefined ? {} : { listings }),
    });
  }

  return refs.length === 0 ? undefined : refs;
};

const communityListingsFromGrpc = (
  listings: readonly SocialResearchCommunityListing[] | undefined,
): readonly string[] | undefined => {
  const values = (listings ?? []).flatMap((listing) => {
    switch (listing) {
      case SocialResearchCommunityListing.SOCIAL_RESEARCH_COMMUNITY_LISTING_TOP:
        return ['top'];
      case SocialResearchCommunityListing.SOCIAL_RESEARCH_COMMUNITY_LISTING_HOT:
        return ['hot'];
      case SocialResearchCommunityListing.SOCIAL_RESEARCH_COMMUNITY_LISTING_NEW:
        return ['new'];
      default:
        return [];
    }
  });

  return values.length === 0 ? undefined : values;
};

const unary = async <TResponse>(
  callback: sendUnaryData<TResponse>,
  handle: () => Promise<TResponse> | TResponse,
): Promise<void> => {
  try {
    callback(null, await handle());
  } catch (error) {
    callback(serviceErrorFor(error), null);
  }
};

const serviceErrorFor = (error: unknown): ServiceError => {
  return serviceError(
    status.INVALID_ARGUMENT,
    error instanceof Error
      ? error.message
      : 'Unknown social research gRPC error',
  );
};

const serviceError = (code: status, message: string): ServiceError => {
  const error = new Error(message) as ServiceError;
  error.code = code;

  return error;
};

const rejectUnauthorized = <TResponse>(
  call: ServerUnaryCall<unknown, unknown>,
  callback: sendUnaryData<TResponse>,
  serviceToken: string | undefined,
): boolean => {
  if (isAuthorized(call, serviceToken)) {
    return false;
  }

  callback(serviceError(status.UNAUTHENTICATED, 'Unauthorized'), null);

  return true;
};

const isAuthorized = (
  call: ServerUnaryCall<unknown, unknown>,
  serviceToken: string | undefined,
): boolean => {
  if (serviceToken === undefined) {
    return true;
  }

  return call.metadata.get('authorization').includes(`Bearer ${serviceToken}`);
};

const jsonField = (value: string | undefined): unknown | undefined => {
  const normalized = nonEmpty(value);

  return normalized === undefined ? undefined : JSON.parse(normalized);
};

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const nonEmptyArray = (
  values: readonly string[] | undefined,
): readonly string[] | undefined => {
  const filtered = (values ?? []).map((value) => value.trim()).filter(Boolean);

  return filtered.length === 0 ? undefined : filtered;
};

const positiveInteger = (value: number | undefined): number | undefined =>
  value === undefined || value <= 0 ? undefined : value;

const emptyRecordToUndefined = (
  value: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined =>
  Object.keys(value).length === 0 ? undefined : value;
