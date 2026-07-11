import { redactSensitiveText } from "@social-monitor/shared-kernel";

import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceQuery,
  SourceQueryPlannerPort,
  SourceConfigReaderPort,
  SourceFetcherPort,
  SourceProviderScanContext,
  SourceProviderRegistryPort,
  SourceProviderPort,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceFetchTelemetry,
  SourcePaginationStopReason,
  SourceRuntimeConfig,
} from "../../ports";
import { SourceFetchError } from "../../ports";
import {
  adaptivePaginationFailureWarning,
  adaptivePaginationStatsWarning,
  createAdaptivePaginationAccumulator,
  readAdaptivePaginationPolicy,
  type AdaptivePaginationStopReason,
} from "./adaptive-source-pagination";
import {
  DefaultSourceQueryPlanRuntimeCompiler,
  isSourceQueryPlannerEnabled,
  sourceQueryPlannerIntentFromConfig,
  type SourceQueryPlanRuntimeCompiler,
} from "./source-query-plan-runtime-compiler";

type ScanWithTelemetryResult = {
  readonly result: SourceProviderScanResult;
  readonly targetItemCount: number;
  readonly pageCount: number;
  readonly paginationDuplicateItemCount: number;
  readonly paginationStopReason: SourcePaginationStopReason;
};

export class RegistrySourceFetcherAdapter implements SourceFetcherPort {
  constructor(
    private readonly registry: SourceProviderRegistryPort,
    private readonly sourceConfigs?: SourceConfigReaderPort,
    private readonly sourceQueryPlanner?: SourceQueryPlannerPort,
    private readonly sourceQueryPlanCompiler: SourceQueryPlanRuntimeCompiler = new DefaultSourceQueryPlanRuntimeCompiler(),
  ) {}

  async fetch(
    command: FetchSourceItemsCommand,
  ): Promise<FetchSourceItemsResult> {
    const provider = await this.registry.getProvider(command.providerKey);

    if (!provider) {
      throw new Error(`Source provider not registered: ${command.providerKey}`);
    }

    const validation = provider.validateBinding(command.sourceQuery);
    if (!validation.ok) {
      throw new SourceFetchError({
        providerKey: command.providerKey,
        kind: "invalid_query",
        retryable: false,
        message: validation.reason,
      });
    }

    const initialConfig = await this.readMergedConfig(command);
    const planned = await this.resolveSourceQuery({
      command,
      providerKey: provider.key(),
      config: initialConfig,
    });
    const plannedValidation = provider.validateBinding(planned.sourceQuery);
    if (!plannedValidation.ok) {
      throw new SourceFetchError({
        providerKey: command.providerKey,
        kind: "invalid_query",
        retryable: false,
        message: plannedValidation.reason,
      });
    }

    const context = this.buildContext(
      command,
      mergeSourceQueryParameters(initialConfig, planned.sourceQuery.parameters),
    );

    try {
      const plan = {
        ...provider.planScan(planned.sourceQuery, context),
        cursor: command.cursor,
      };
      const scanned = await this.scanWithAdaptivePagination(
        provider,
        plan,
        context,
      );
      const filteredResult = filterByTargetPublishedWindow(
        scanned.result,
        context,
      );

      return {
        items: filteredResult.items,
        conversationUnits: filteredResult.conversationUnits,
        nextCursor: filteredResult.nextCursor,
        warnings: compactUnique([
          ...planned.warnings,
          ...(filteredResult.warnings ?? []),
        ]),
        telemetry: buildSourceFetchTelemetry({
          scanned,
          filteredResult,
          context,
        }),
      };
    } catch (error) {
      const failure = provider.classifyError(error, context);

      throw new SourceFetchError({
        providerKey: provider.key(),
        kind: failure.kind,
        retryable: failure.retryable,
        message: failure.message,
        retryAfterMs: failure.retryAfterMs,
        rateLimitResetAt: failure.rateLimitResetAt,
      });
    }
  }

  private async scanWithAdaptivePagination(
    provider: SourceProviderPort,
    initialPlan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<ScanWithTelemetryResult> {
    const policyResult = readAdaptivePaginationPolicy({
      config: context.config,
      cursorModel: provider.capabilityProfile().cursorModel,
      firstPageLimit: initialPlan.maxItems,
    });

    if (!policyResult.enabled) {
      const result = await provider.scan(initialPlan, context);
      const resultWithWarning =
        policyResult.warning === undefined
          ? result
          : {
              ...result,
              warnings: compactUnique([
                ...result.warnings,
                policyResult.warning,
              ]),
            };

      return {
        result: resultWithWarning,
        targetItemCount: initialPlan.maxItems,
        pageCount: 1,
        paginationDuplicateItemCount: 0,
        paginationStopReason: "single_page",
      };
    }

    const accumulator = createAdaptivePaginationAccumulator();
    let cursor = initialPlan.cursor;
    let nextCursor: string | undefined;
    let stopReason: AdaptivePaginationStopReason = "max_pages";

    for (let page = 0; page < policyResult.policy.maxPages; page += 1) {
      let result: SourceProviderScanResult;

      try {
        result = await provider.scan({ ...initialPlan, cursor }, context);
      } catch (error) {
        if (page === 0) {
          throw error;
        }

        const failure = provider.classifyError(error, context);
        if (!failure.retryable) {
          throw error;
        }

        stopReason = "partial_retryable_failure";
        const state = accumulator.state(stopReason);
        return {
          result: {
            items: state.items,
            conversationUnits: state.conversationUnits,
            nextCursor: cursor,
            warnings: compactUnique([
              ...state.warnings,
              adaptivePaginationFailureWarning({
                kind: failure.kind,
                message: failure.message,
              }),
              adaptivePaginationStatsWarning(state),
            ]),
          },
          targetItemCount: policyResult.policy.targetItems,
          pageCount: state.pageCount,
          paginationDuplicateItemCount: state.duplicateItemCount,
          paginationStopReason: state.stopReason,
        };
      }

      const pageStats = accumulator.appendPage(result);
      nextCursor = result.nextCursor;

      if (accumulator.uniqueItemCount() >= policyResult.policy.targetItems) {
        stopReason = "target_items";
        break;
      }

      if (nextCursor === undefined) {
        stopReason = "no_next_cursor";
        break;
      }

      if (nextCursor === cursor) {
        stopReason = "cursor_not_advanced";
        break;
      }

      if (pageStats.newItemCount < policyResult.policy.minNewItemsPerPage) {
        stopReason = "low_new_item_yield";
        break;
      }

      if (pageStats.duplicateRate > policyResult.policy.maxDuplicateRate) {
        stopReason = "high_duplicate_rate";
        break;
      }

      cursor = nextCursor;
    }

    const state = accumulator.state(stopReason);

    return {
      result: {
        items: state.items,
        conversationUnits: state.conversationUnits,
        nextCursor,
        warnings: compactUnique([
          ...state.warnings,
          adaptivePaginationStatsWarning(state),
        ]),
      },
      targetItemCount: policyResult.policy.targetItems,
      pageCount: state.pageCount,
      paginationDuplicateItemCount: state.duplicateItemCount,
      paginationStopReason: state.stopReason,
    };
  }

  private async readMergedConfig(
    command: FetchSourceItemsCommand,
  ): Promise<SourceRuntimeConfig | undefined> {
    const config = await this.sourceConfigs?.readConfig({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });

    return mergeSourceQueryParameters(config, command.sourceQuery.parameters);
  }

  private async resolveSourceQuery(params: {
    readonly command: FetchSourceItemsCommand;
    readonly providerKey: string;
    readonly config?: SourceRuntimeConfig;
  }): Promise<{
    readonly sourceQuery: SourceQuery;
    readonly warnings: readonly string[];
  }> {
    if (
      this.sourceQueryPlanner === undefined ||
      !isSourceQueryPlannerEnabled(params.config)
    ) {
      return { sourceQuery: params.command.sourceQuery, warnings: [] };
    }

    try {
      const plan = await this.sourceQueryPlanner.compilePlan({
        intent: sourceQueryPlannerIntentFromConfig({
          providerKey: params.providerKey,
          sourceQuery: params.command.sourceQuery,
          config: params.config,
        }),
      });
      const compiled = this.sourceQueryPlanCompiler.compile({
        providerKey: params.providerKey,
        originalSourceQuery: params.command.sourceQuery,
        runtimeConfig: params.config,
        plan,
      });

      return {
        sourceQuery: compiled.sourceQuery,
        warnings: [...plan.warnings, ...compiled.warnings],
      };
    } catch (error) {
      const message = redactSensitiveText(
        error instanceof Error ? error.message : "Unknown planner error",
      );

      return {
        sourceQuery: params.command.sourceQuery,
        warnings: [`source_query_planner.degraded:${message}`],
      };
    }
  }

  private buildContext(
    command: FetchSourceItemsCommand,
    config: SourceRuntimeConfig | undefined,
  ): SourceProviderScanContext {
    const baseContext = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanJobId: command.scanJobId,
      correlationId: command.correlationId,
    };

    return config === undefined ? baseContext : { ...baseContext, config };
  }
}

const mergeSourceQueryParameters = (
  config: SourceRuntimeConfig | null | undefined,
  parameters: SourceRuntimeConfig | undefined,
): SourceRuntimeConfig | undefined => {
  if (config === undefined || config === null) {
    return parameters;
  }

  if (parameters === undefined) {
    return config;
  }

  return {
    ...config,
    ...parameters,
  };
};

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];

const buildSourceFetchTelemetry = (params: {
  readonly scanned: ScanWithTelemetryResult;
  readonly filteredResult: SourceProviderScanResult;
  readonly context: SourceProviderScanContext;
}): SourceFetchTelemetry => {
  const publishedTimes = params.filteredResult.items
    .map((item) => item.publishedAt.getTime())
    .filter(Number.isFinite);
  const targetPublishedWindow = readTargetPublishedWindow(
    params.context.config,
  );

  return {
    targetItemCount: params.scanned.targetItemCount,
    collectedItemCount: params.scanned.result.items.length,
    acceptedItemCount: params.filteredResult.items.length,
    outsideWindowItemCount:
      params.scanned.result.items.length - params.filteredResult.items.length,
    pageCount: params.scanned.pageCount,
    paginationDuplicateItemCount: params.scanned.paginationDuplicateItemCount,
    paginationStopReason: params.scanned.paginationStopReason,
    rateLimitEventCount: countRateLimitWarnings(params.scanned.result.warnings),
    ...(targetPublishedWindow === undefined
      ? {}
      : {
          targetPublishedWindowStartedAt: targetPublishedWindow.start,
          targetPublishedWindowEndedAt: targetPublishedWindow.end,
        }),
    ...(publishedTimes.length === 0
      ? {}
      : {
          oldestAcceptedPublishedAt: new Date(Math.min(...publishedTimes)),
          newestAcceptedPublishedAt: new Date(Math.max(...publishedTimes)),
        }),
  };
};

const countRateLimitWarnings = (warnings: readonly string[]): number =>
  warnings.filter((warning) => {
    const normalized = warning.toLowerCase();

    return (
      normalized.includes("partial_rate_limit") ||
      normalized.includes("partial:rate_limited")
    );
  }).length;

const filterByTargetPublishedWindow = (
  result: SourceProviderScanResult,
  context: SourceProviderScanContext,
): SourceProviderScanResult => {
  const window = readTargetPublishedWindow(context.config);
  if (window === undefined) {
    return result;
  }

  const items = result.items.filter(
    (item) =>
      item.publishedAt.getTime() >= window.start.getTime() &&
      item.publishedAt.getTime() < window.end.getTime(),
  );
  if (items.length === result.items.length) {
    return result;
  }

  const retainedRootExternalIds = new Set(items.map((item) => item.externalId));

  return {
    ...result,
    items,
    conversationUnits: result.conversationUnits?.filter((unit) =>
      retainedRootExternalIds.has(unit.rootExternalId),
    ),
    warnings: compactUnique([
      ...result.warnings,
      [
        "target_published_window.filtered",
        `kept=${items.length}`,
        `dropped=${result.items.length - items.length}`,
      ].join(";"),
    ]),
  };
};

const readTargetPublishedWindow = (
  config: SourceRuntimeConfig | undefined,
): { readonly start: Date; readonly end: Date } | undefined => {
  const raw = readRecord(config?.targetPublishedWindow);
  const start = readDate(raw?.startInclusive);
  const end = readDate(raw?.endExclusive);

  return start !== undefined && end !== undefined && start < end
    ? { start, end }
    : undefined;
};

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const readDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
};
