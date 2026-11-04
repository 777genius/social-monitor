import type {
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourcePaginationStopReason,
} from '../../ports';
import {
  adaptivePaginationFailureWarning,
  adaptivePaginationStatsWarning,
  createAdaptivePaginationAccumulator,
  readAdaptivePaginationPolicy,
  type AdaptivePaginationStopReason,
} from './adaptive-source-pagination';
import { compactUnique } from './source-fetch-result-assembly';

export type ScanWithTelemetryResult = {
  readonly result: SourceProviderScanResult;
  readonly targetItemCount: number;
  readonly pageCount: number;
  readonly paginationDuplicateItemCount: number;
  readonly paginationStopReason: SourcePaginationStopReason;
};

export async function scanSourceProviderPages(
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
      pageCount: result.pagination?.pageCount ?? 1,
      paginationDuplicateItemCount: result.pagination?.duplicateItemCount ?? 0,
      paginationStopReason: result.pagination?.stopReason ?? "single_page",
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
