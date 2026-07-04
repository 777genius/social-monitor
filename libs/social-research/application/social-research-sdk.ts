import type {
  FetchSocialThreadCommand,
  SocialResearchExecutionScope,
  SocialResearchGateway,
  SocialSearchRun,
  SocialThread,
} from './contracts/social-research-gateway';
import type {
  SocialResearchExecutionPolicyPort,
  SocialResearchResultCachePort,
} from './contracts/social-research-execution-policy';
import {
  explainSocialSourceReadiness,
  findSocialSourceProfile,
  listSocialSources,
  type SocialSourceListInput,
  type SocialSourceProfileInput,
  type SocialSourceReadinessExplanation,
} from './social-source-discovery';
import {
  mergePlannerOptions,
  searchRunTrace,
  sourceKeyFromProfileInput,
} from './social-research-sdk-support';
import type { RankSocialItemsInput } from '../domain/policies/social-item-ranker';
import { rankSocialItems } from '../domain/policies/social-item-ranker';
import {
  explainSocialSearchPlan,
  planSocialSearch,
  type SocialSearchPlannerOptions,
} from '../domain/policies/social-search-planner';
import type { RankedSocialSearchItem } from '../domain/entities/social-search-item';
import type {
  SocialSearchIntent,
  SocialSourceKey,
} from '../domain/value-objects/social-search-intent';
import type { SocialSourceRegistryEntry } from '../domain/value-objects/social-source-registry';
import type {
  SocialSearchPlan,
  SocialSearchPlanError,
  SocialSearchPlanResult,
} from '../domain/value-objects/social-search-plan';
import {
  createSocialSearchIntent,
  type SocialResearchRequestInput,
} from './social-research-request';

export const socialResearchFailureCodes = [
  'invalid_search_intent',
  'source_not_found',
  'gateway_required',
  'execution_denied',
  'execution_failed',
] as const;

export type SocialResearchFailureCode =
  (typeof socialResearchFailureCodes)[number];

export type SocialResearchSdkErrorCode = Exclude<
  SocialResearchFailureCode,
  'execution_failed'
>;

export type SocialResearchFailure = {
  readonly code: SocialResearchFailureCode;
  readonly message: string;
  readonly details: readonly SocialSearchPlanError[];
  readonly retryAfterMs?: number;
  readonly causeName?: string;
};

export type SocialResearchResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SocialResearchFailure };

export type SocialResearchSdkDependencies = {
  readonly gateway?: SocialResearchGateway;
  readonly defaultExecutionScope?: SocialResearchExecutionScope;
  readonly defaultPlannerOptions?: SocialSearchPlannerOptions;
  readonly executionPolicy?: SocialResearchExecutionPolicyPort;
  readonly resultCache?: SocialResearchResultCachePort;
  readonly sourceRegistry?: readonly SocialSourceRegistryEntry[];
};

export type SocialResearchSearchOptions = SocialSearchPlannerOptions & {
  readonly execution?: SocialResearchExecutionScope;
};

export class SocialResearchSdkError extends Error {
  override readonly name = 'SocialResearchSdkError';

  readonly retryAfterMs?: number;
  readonly causeName?: string;

  constructor(
    readonly code: SocialResearchSdkErrorCode,
    message: string,
    readonly details: readonly SocialSearchPlanError[] = [],
    options: {
      readonly retryAfterMs?: number;
      readonly causeName?: string;
    } = {},
  ) {
    super(message);
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
    if (options.causeName !== undefined) {
      this.causeName = options.causeName;
    }
  }
}

export const toSocialResearchFailure = (
  error: unknown,
): SocialResearchFailure => {
  if (error instanceof SocialResearchSdkError) {
    const failure: SocialResearchFailure = {
      code: error.code,
      message: error.message,
      details: error.details,
    };

    return withOptionalFailureMetadata(failure, {
      retryAfterMs: error.retryAfterMs,
      causeName: error.causeName,
    });
  }

  return withOptionalFailureMetadata(
    {
      code: 'execution_failed',
      message: 'Social research execution failed.',
      details: [],
    },
    {
      causeName: causeNameFor(error),
    },
  );
};

export class SocialResearchSdk {
  constructor(
    private readonly dependencies: SocialResearchSdkDependencies = {},
  ) {}

  createSearchPlan(
    intent: SocialSearchIntent,
    options?: SocialSearchPlannerOptions,
  ): SocialSearchPlanResult {
    return planSocialSearch(
      intent,
      mergePlannerOptions(this.dependencies.defaultPlannerOptions, options),
    );
  }

  createSearchPlanFromRequest(
    request: SocialResearchRequestInput,
    options?: SocialSearchPlannerOptions,
  ): SocialSearchPlanResult {
    return this.createSearchPlan(createSocialSearchIntent(request), options);
  }

  explainSearchPlan(
    intent: SocialSearchIntent,
    options?: SocialSearchPlannerOptions,
  ): string {
    const result = this.createSearchPlan(intent, options);

    if (!result.ok) {
      throw new SocialResearchSdkError(
        'invalid_search_intent',
        'Cannot explain an invalid social search intent.',
        result.errors,
      );
    }

    return explainSocialSearchPlan(result.plan);
  }

  explainSearchRequest(
    request: SocialResearchRequestInput,
    options?: SocialSearchPlannerOptions,
  ): string {
    return this.explainSearchPlan(createSocialSearchIntent(request), options);
  }

  tryExplainSearchPlan(
    intent: SocialSearchIntent,
    options?: SocialSearchPlannerOptions,
  ): SocialResearchResult<string> {
    return toSocialResearchResult(() =>
      this.explainSearchPlan(intent, options),
    );
  }

  tryExplainSearchRequest(
    request: SocialResearchRequestInput,
    options?: SocialSearchPlannerOptions,
  ): SocialResearchResult<string> {
    return toSocialResearchResult(() =>
      this.explainSearchRequest(request, options),
    );
  }

  async search(
    intent: SocialSearchIntent,
    options?: SocialResearchSearchOptions,
  ): Promise<SocialSearchRun> {
    const result = this.createSearchPlan(intent, options);

    if (!result.ok) {
      throw new SocialResearchSdkError(
        'invalid_search_intent',
        'Cannot execute an invalid social search intent.',
        result.errors,
      );
    }

    const executableCommand = {
      plan: result.plan,
      execution: options?.execution ?? this.dependencies.defaultExecutionScope,
    };
    const policyDecision =
      await this.dependencies.executionPolicy?.authorizeSearch(
        executableCommand,
      );

    if (policyDecision?.allowed === false) {
      throw new SocialResearchSdkError(
        'execution_denied',
        policyDecision.reason,
        [],
        { retryAfterMs: policyDecision.retryAfterMs },
      );
    }

    const cacheKey = policyDecision?.cacheKey;
    const cacheScope = policyDecision?.cacheScope;
    const resultCache = this.dependencies.resultCache;
    const cacheEnabled = cacheKey !== undefined && resultCache !== undefined;

    if (cacheEnabled) {
      const cached = await resultCache.readSearch(cacheKey, cacheScope);
      if (cached !== null) {
        return {
          ...cached,
          trace: searchRunTrace({
            plan: result.plan,
            cacheKeyAvailable: true,
            cacheScope,
            cacheStatus: 'hit',
            gatewayInvoked: false,
          }),
        };
      }
    }

    const run =
      await this.requireGateway().executeSearchPlan(executableCommand);
    if (cacheEnabled) {
      await resultCache.writeSearch(cacheKey, run, cacheScope);
    }

    return {
      ...run,
      trace: searchRunTrace({
        plan: result.plan,
        cacheKeyAvailable: cacheKey !== undefined,
        cacheScope,
        cacheStatus: cacheEnabled ? 'write_through' : 'disabled',
        gatewayInvoked: true,
      }),
    };
  }

  async searchRequest(
    request: SocialResearchRequestInput,
    options?: SocialResearchSearchOptions,
  ): Promise<SocialSearchRun> {
    return this.search(createSocialSearchIntent(request), options);
  }

  async trySearch(
    intent: SocialSearchIntent,
    options?: SocialResearchSearchOptions,
  ): Promise<SocialResearchResult<SocialSearchRun>> {
    return toAsyncSocialResearchResult(() => this.search(intent, options));
  }

  async trySearchRequest(
    request: SocialResearchRequestInput,
    options?: SocialResearchSearchOptions,
  ): Promise<SocialResearchResult<SocialSearchRun>> {
    return toAsyncSocialResearchResult(() =>
      this.searchRequest(request, options),
    );
  }

  rankResults(input: RankSocialItemsInput): readonly RankedSocialSearchItem[] {
    return rankSocialItems(input);
  }

  tryRankResults(
    input: RankSocialItemsInput,
  ): SocialResearchResult<readonly RankedSocialSearchItem[]> {
    return toSocialResearchResult(() => this.rankResults(input));
  }

  listSources(
    input: SocialSourceListInput = {},
  ): readonly SocialSourceRegistryEntry[] {
    return listSocialSources(this.dependencies.sourceRegistry, input);
  }

  getSourceProfile(
    input: SocialSourceProfileInput | SocialSourceKey,
  ): SocialSourceRegistryEntry {
    const source = findSocialSourceProfile(
      this.dependencies.sourceRegistry,
      input,
    );

    if (source === undefined) {
      throw new SocialResearchSdkError(
        'source_not_found',
        `Social source is not registered: ${sourceKeyFromProfileInput(input)}.`,
      );
    }

    return source;
  }

  tryGetSourceProfile(
    input: SocialSourceProfileInput | SocialSourceKey,
  ): SocialResearchResult<SocialSourceRegistryEntry> {
    return toSocialResearchResult(() => this.getSourceProfile(input));
  }

  explainSourceReadiness(
    input: SocialSourceProfileInput | SocialSourceKey,
  ): SocialSourceReadinessExplanation {
    return explainSocialSourceReadiness(this.getSourceProfile(input));
  }

  tryExplainSourceReadiness(
    input: SocialSourceProfileInput | SocialSourceKey,
  ): SocialResearchResult<SocialSourceReadinessExplanation> {
    return toSocialResearchResult(() => this.explainSourceReadiness(input));
  }

  async fetchThread(command: FetchSocialThreadCommand): Promise<SocialThread> {
    const executableCommand = {
      ...command,
      execution: command.execution ?? this.dependencies.defaultExecutionScope,
    };
    const policyDecision =
      await this.dependencies.executionPolicy?.authorizeThreadFetch({
        command: executableCommand,
      });

    if (policyDecision?.allowed === false) {
      throw new SocialResearchSdkError(
        'execution_denied',
        policyDecision.reason,
        [],
        { retryAfterMs: policyDecision.retryAfterMs },
      );
    }

    const cacheKey = policyDecision?.cacheKey;
    const cached =
      cacheKey === undefined
        ? null
        : await this.dependencies.resultCache?.readThread(
            cacheKey,
            policyDecision?.cacheScope,
          );
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const thread = await this.requireGateway().fetchThread(executableCommand);
    if (cacheKey !== undefined) {
      await this.dependencies.resultCache?.writeThread(
        cacheKey,
        thread,
        policyDecision?.cacheScope,
      );
    }

    return thread;
  }

  async tryFetchThread(
    command: FetchSocialThreadCommand,
  ): Promise<SocialResearchResult<SocialThread>> {
    return toAsyncSocialResearchResult(() => this.fetchThread(command));
  }

  explainPlan(plan: SocialSearchPlan): string {
    return explainSocialSearchPlan(plan);
  }

  private requireGateway(): SocialResearchGateway {
    if (this.dependencies.gateway === undefined) {
      throw new SocialResearchSdkError(
        'gateway_required',
        'SocialResearchGateway is required for execution methods.',
      );
    }

    return this.dependencies.gateway;
  }
}

const toSocialResearchResult = <T>(
  operation: () => T,
): SocialResearchResult<T> => {
  try {
    return { ok: true, value: operation() };
  } catch (error: unknown) {
    return { ok: false, error: toSocialResearchFailure(error) };
  }
};

const toAsyncSocialResearchResult = async <T>(
  operation: () => Promise<T>,
): Promise<SocialResearchResult<T>> => {
  try {
    return { ok: true, value: await operation() };
  } catch (error: unknown) {
    return { ok: false, error: toSocialResearchFailure(error) };
  }
};

const causeNameFor = (error: unknown): string | undefined => {
  if (error instanceof Error) {
    return error.name;
  }

  return undefined;
};

const withOptionalFailureMetadata = (
  failure: SocialResearchFailure,
  metadata: {
    readonly retryAfterMs?: number;
    readonly causeName?: string;
  },
): SocialResearchFailure => ({
  ...failure,
  ...(metadata.retryAfterMs === undefined
    ? {}
    : { retryAfterMs: metadata.retryAfterMs }),
  ...(metadata.causeName === undefined
    ? {}
    : { causeName: metadata.causeName }),
});
