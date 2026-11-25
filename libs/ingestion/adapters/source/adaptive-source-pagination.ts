import { redactSensitiveText } from "@social-monitor/shared-kernel";

import type {
  FetchedConversationUnit,
  FetchedSourceItem,
  SourceCursorModel,
  SourceProviderScanResult,
  SourceRuntimeConfig,
  SourcePaginationStopReason,
} from "../../ports";

export type AdaptivePaginationPolicy = {
  readonly enabled: true;
  readonly targetItems: number;
  readonly maxPages: number;
  readonly minNewItemsPerPage: number;
  readonly maxDuplicateRate: number;
};

export type AdaptivePaginationReadResult =
  | { readonly enabled: false; readonly warning?: string }
  | { readonly enabled: true; readonly policy: AdaptivePaginationPolicy };

export type AdaptivePaginationState = {
  readonly items: readonly FetchedSourceItem[];
  readonly conversationUnits: readonly FetchedConversationUnit[];
  readonly warnings: readonly string[];
  readonly uniqueItemCount: number;
  readonly duplicateItemCount: number;
  readonly pageCount: number;
  readonly stopReason: AdaptivePaginationStopReason;
};

export type AdaptivePaginationStopReason = Exclude<
  SourcePaginationStopReason,
  "single_page"
>;

const supportedCursorModels: readonly SourceCursorModel[] = [
  "opaque",
  "page_token",
];

export const readAdaptivePaginationPolicy = (params: {
  readonly config: SourceRuntimeConfig | undefined;
  readonly cursorModel: SourceCursorModel;
  readonly firstPageLimit: number;
  readonly providerManagesPagination?: boolean;
}): AdaptivePaginationReadResult => {
  const raw = readRecord(params.config?.adaptivePagination);
  if (raw === undefined || readBoolean(raw.enabled, false) !== true) {
    return { enabled: false };
  }

  if (
    !supportedCursorModels.includes(params.cursorModel) &&
    params.providerManagesPagination !== true
  ) {
    return {
      enabled: false,
      warning: `adaptive_pagination.disabled:unsupported_cursor_model:${params.cursorModel}`,
    };
  }

  return {
    enabled: true,
    policy: {
      enabled: true,
      targetItems: readInteger(
        raw.targetItems,
        Math.max(params.firstPageLimit, params.firstPageLimit * 2),
        1,
        500,
      ),
      maxPages: readInteger(raw.maxPages, 2, 1, 5),
      minNewItemsPerPage: readInteger(raw.minNewItemsPerPage, 3, 1, 100),
      maxDuplicateRate: readRatio(raw.maxDuplicateRate, 0.7),
    },
  };
};

export const createAdaptivePaginationAccumulator = () => {
  const itemsByKey = new Map<string, FetchedSourceItem>();
  const conversationUnitsByKey = new Map<string, FetchedConversationUnit>();
  const warnings: string[] = [];
  let duplicateItemCount = 0;
  let pageCount = 0;

  return {
    appendPage(result: SourceProviderScanResult): {
      readonly newItemCount: number;
      readonly duplicateItemCount: number;
      readonly duplicateRate: number;
    } {
      pageCount += 1;
      let pageNewItemCount = 0;
      let pageDuplicateItemCount = 0;

      for (const item of result.items) {
        const key = itemKey(item);
        if (itemsByKey.has(key)) {
          duplicateItemCount += 1;
          pageDuplicateItemCount += 1;
          continue;
        }

        itemsByKey.set(key, item);
        pageNewItemCount += 1;
      }

      for (const unit of result.conversationUnits ?? []) {
        conversationUnitsByKey.set(conversationUnitKey(unit), unit);
      }

      warnings.push(...result.warnings);

      const pageItemCount = pageNewItemCount + pageDuplicateItemCount;
      return {
        newItemCount: pageNewItemCount,
        duplicateItemCount: pageDuplicateItemCount,
        duplicateRate:
          pageItemCount === 0 ? 0 : pageDuplicateItemCount / pageItemCount,
      };
    },
    uniqueItemCount(): number {
      return itemsByKey.size;
    },
    state(stopReason: AdaptivePaginationStopReason): AdaptivePaginationState {
      return {
        items: [...itemsByKey.values()],
        conversationUnits: [...conversationUnitsByKey.values()],
        warnings,
        uniqueItemCount: itemsByKey.size,
        duplicateItemCount,
        pageCount,
        stopReason,
      };
    },
  };
};

export const adaptivePaginationStatsWarning = (
  state: AdaptivePaginationState,
): string =>
  [
    "adaptive_pagination.stats",
    `pages=${state.pageCount}`,
    `items=${state.uniqueItemCount}`,
    `duplicates=${state.duplicateItemCount}`,
    `stop=${state.stopReason}`,
  ].join(";");

export const adaptivePaginationFailureWarning = (params: {
  readonly kind: string;
  readonly message: string;
}): string =>
  `adaptive_pagination.partial:${params.kind}:${redactSensitiveText(params.message)}`;

const itemKey = (item: FetchedSourceItem): string =>
  `${item.externalId.trim()}|${item.canonicalUrl.trim()}`;

const conversationUnitKey = (unit: FetchedConversationUnit): string =>
  `${unit.rootExternalId}|${unit.providerUnitId}|${unit.canonicalUrl}`;

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Readonly<Record<string, unknown>>;
};

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const readInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : fallback;
};

const readRatio = (value: unknown, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  return typeof value === "number" && value >= 0 && value <= 1
    ? value
    : fallback;
};
