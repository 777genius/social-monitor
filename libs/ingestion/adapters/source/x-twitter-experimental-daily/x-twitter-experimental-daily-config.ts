import type {
  SourceProviderScanContext,
  SourceProviderScanPlan,
} from "../../../ports";
import type { XDailySearchProduct } from "./x-daily-collector-client.port";

// Runtime-config parsing, gRPC metadata readers and per-query cursor codecs
// for the experimental X/Twitter daily source provider.
export type XExperimentalDailyScanConfig = {
  readonly language?: string;
  readonly windowHours: number;
  readonly windowEnd: Date;
  readonly searchProducts: readonly XDailySearchProduct[];
  readonly searchQueries: readonly string[];
  readonly limitPerProduct?: number;
  readonly maxItemsPerQuery: number;
  readonly maxItemsBySearchQuery: ReadonlyMap<string, number>;
  readonly minLikes?: number;
  readonly minRetweets?: number;
  readonly minReplies?: number;
};

export const parseConfig = (
  plan: SourceProviderScanPlan,
  context: SourceProviderScanContext,
  now: Date,
): XExperimentalDailyScanConfig => {
  const searchQueries = readSearchQueries(plan.query.query, context.config);
  const maxItemsBySearchQuery = readMaxItemsBySearchQuery(
    context.config,
    searchQueries,
  );
  const maxItemsPerQuery = readMaxItemsPerQuery(
    context.config,
    plan.maxItems,
    searchQueries.length,
  );

  return {
    language: readOptionalString(context.config?.language),
    windowHours: readPositiveInteger(context.config?.windowHours, 24, 1, 72),
    windowEnd: readDate(context.config?.windowEnd, now),
    searchProducts: readSearchProducts(context.config?.searchProducts),
    searchQueries,
    limitPerProduct: readOptionalPositiveInteger(
      context.config?.limitPerProduct,
      1,
      100,
    ),
    maxItemsPerQuery,
    maxItemsBySearchQuery,
    minLikes: readOptionalPositiveInteger(
      context.config?.minLikes,
      0,
      1_000_000,
    ),
    minRetweets: readOptionalPositiveInteger(
      context.config?.minRetweets,
      0,
      1_000_000,
    ),
    minReplies: readOptionalPositiveInteger(
      context.config?.minReplies,
      0,
      1_000_000,
    ),
  };
};

export const readGrpcMetadataPositiveInteger = (
  error: unknown,
  key: string,
): number | undefined => {
  const value = readGrpcMetadataString(error, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const readGrpcMetadataDate = (
  error: unknown,
  key: string,
): Date | undefined => {
  const value = readGrpcMetadataString(error, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const readGrpcMetadataString = (
  error: unknown,
  key: string,
): string | undefined => {
  const metadata = (
    error as { readonly metadata?: { get(name: string): unknown[] } }
  ).metadata;
  const value = metadata?.get(key)[0];

  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length === 0 ? undefined : trimmed;
  }

  if (Buffer.isBuffer(value)) {
    const trimmed = value.toString("utf8").trim();

    return trimmed.length === 0 ? undefined : trimmed;
  }

  return undefined;
};

export const readSearchProducts = (
  value: unknown,
): readonly XDailySearchProduct[] => {
  if (!Array.isArray(value)) {
    return ["top"];
  }

  const products = value.flatMap((item): readonly XDailySearchProduct[] => {
    if (item === "top" || item === "latest") {
      return [item];
    }

    return [];
  });

  return products.length === 0 ? ["top"] : [...new Set(products)];
};

export const readSearchQueries = (
  primaryQuery: string,
  config: unknown,
): readonly string[] => {
  const record = readRecordOrUndefined(config);
  const explicitQueries = readExplicitQueries(record ?? config);
  const queryPlan = readQueryLanePlan(record);
  const queries = compactUnique([
    primaryQuery,
    ...explicitQueries,
    ...compiledQueryLanes(primaryQuery, queryPlan),
  ]).slice(0, queryPlan.maxQueries);

  for (const query of queries) {
    if (query.length < 2 || query.length > 500) {
      throw new Error("X/Twitter search query must be 2-500 characters");
    }
  }

  return queries;
};

type XQueryLanePlan = {
  readonly maxQueries: number;
  readonly productTerms: readonly string[];
  readonly handles: readonly string[];
  readonly includeFromLanes: boolean;
  readonly includeMentionLanes: boolean;
  readonly includeFallbackQuery: boolean;
};

const readExplicitQueries = (value: unknown): readonly string[] => {
  const record = readRecordOrUndefined(value);
  const raw =
    record === undefined ? value : record.searchQueries ?? record.queries;

  return readStringArray(raw);
};

const readQueryLanePlan = (
  config: Readonly<Record<string, unknown>> | undefined,
): XQueryLanePlan => {
  const nested = readRecordOrUndefined(config?.queryPlan ?? config?.queryLanes);
  const handles = compactUnique([
    ...readStringArray(nested?.handles),
    ...readStringArray(config?.queryLaneHandles),
    ...readStringArray(config?.trackedHandles),
    ...readStringArray(config?.handles),
  ]).flatMap(readXHandle);
  const productTerms = compactUnique([
    ...readStringArray(nested?.productTerms),
    ...readStringArray(nested?.terms),
    ...readStringArray(config?.queryLaneProductTerms),
    ...readStringArray(config?.productTerms),
    ...readStringArray(config?.entityTerms),
  ]);

  return {
    maxQueries: readPositiveInteger(
      nested?.maxQueries ?? config?.maxSearchQueries,
      8,
      1,
      16,
    ),
    productTerms,
    handles,
    includeFromLanes: readBoolean(
      nested?.includeFromLanes ?? config?.includeFromLanes,
      handles.length > 0,
    ),
    includeMentionLanes: readBoolean(
      nested?.includeMentionLanes ?? config?.includeMentionLanes,
      handles.length > 0,
    ),
    includeFallbackQuery: readBoolean(
      nested?.includeFallbackQuery ?? config?.includeFallbackQuery,
      productTerms.length > 0 || handles.length > 0,
    ),
  };
};

const compiledQueryLanes = (
  primaryQuery: string,
  plan: XQueryLanePlan,
): readonly string[] => [
  ...productTermQueries(plan.productTerms),
  ...(plan.includeFromLanes
    ? plan.handles.map((handle) => `from:${handle}`)
    : []),
  ...(plan.includeMentionLanes
    ? plan.handles.map((handle) => `@${handle}`)
    : []),
  ...(plan.includeFallbackQuery ? fallbackQueries(primaryQuery) : []),
];

const productTermQueries = (terms: readonly string[]): readonly string[] => {
  const queries: string[] = [];

  for (let index = 0; index < terms.length; index += 3) {
    const group = terms.slice(index, index + 3).map(formatSearchTerm);
    if (group.length === 1) {
      queries.push(group[0] ?? "");
      continue;
    }

    queries.push(`(${group.join(" OR ")})`);
  }

  return queries.filter((query) => query.length > 0);
};

const fallbackQueries = (primaryQuery: string): readonly string[] => {
  const tokens = compactUnique(
    (primaryQuery.toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/gu) ?? []).filter(
      (token) => !lowSignalQueryTokens.has(token),
    ),
  );
  const shorter = tokens.slice(0, 2).join(" ");

  return shorter.length >= 2 && shorter !== primaryQuery.trim().toLowerCase()
    ? [shorter]
    : [];
};

const formatSearchTerm = (term: string): string =>
  /[\s:]/u.test(term) ? `"${term.replace(/"/gu, "")}"` : term;

const readXHandle = (value: string): readonly string[] => {
  const handle = value.trim().replace(/^@/u, "");

  return /^[a-zA-Z0-9_]{1,15}$/u.test(handle) ? [handle] : [];
};

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const readMaxItemsPerQuery = (
  config: unknown,
  maxItems: number,
  searchQueryCount: number,
): number => {
  const record = readRecordOrUndefined(config);
  const configured =
    record?.maxItemsPerQuery ??
    record?.maxItemsPerSearchQuery ??
    record?.maxItemsPerLane;

  return readPositiveInteger(
    configured,
    Math.max(1, Math.ceil(maxItems / Math.max(searchQueryCount, 1))),
    1,
    100,
  );
};

const readMaxItemsBySearchQuery = (
  config: unknown,
  searchQueries: readonly string[],
): ReadonlyMap<string, number> => {
  const record = readRecordOrUndefined(config);
  const raw = record?.searchQueryBudgets ?? record?.searchQueryMaxItems;
  const allowedQueries = new Set(searchQueries);
  const entries = Array.isArray(raw)
    ? raw.flatMap((item): readonly [string, number][] => {
        const budget = readRecordOrUndefined(item);
        const query = readOptionalString(budget?.query);
        const maxItems = readBudgetInteger(
          budget?.maxItems ?? budget?.maxItemsPerQuery,
        );

        return query !== undefined &&
          maxItems !== undefined &&
          allowedQueries.has(query)
          ? [[query, maxItems]]
          : [];
      })
    : Object.entries(readRecordOrUndefined(raw) ?? {}).flatMap(
        ([query, value]): readonly [string, number][] => {
          const maxItems = readBudgetInteger(value);

          return maxItems !== undefined && allowedQueries.has(query)
            ? [[query, maxItems]]
            : [];
        },
      );

  return new Map(entries);
};

const readBudgetInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isInteger(parsed) && parsed >= 1
    ? Math.min(parsed, 100)
    : undefined;
};

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" && item.trim().length > 0
          ? [item.trim()]
          : [],
      )
    : [];

const readRecordOrUndefined = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const lowSignalQueryTokens = new Set([
  "and",
  "or",
  "not",
  "the",
  "with",
  "from",
  "since",
  "until",
  "filter",
  "lang",
]);

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

export const readCursorByQuery = (
  cursor: string | undefined,
): ReadonlyMap<string, string> => {
  if (cursor === undefined) {
    return new Map();
  }

  try {
    const parsed: unknown = JSON.parse(cursor);

    if (parsed === null || typeof parsed !== "object") {
      return new Map();
    }

    const queries = (parsed as { readonly queries?: unknown }).queries;

    if (queries === null || typeof queries !== "object") {
      return new Map();
    }

    return new Map(
      Object.entries(queries as Readonly<Record<string, unknown>>).flatMap(
        ([query, value]) => (typeof value === "string" ? [[query, value]] : []),
      ),
    );
  } catch {
    return new Map();
  }
};

export const nextCursorForQueries = (
  queries: readonly string[],
  cursorsByQuery: ReadonlyMap<string, string>,
  previousCursorsByQuery: ReadonlyMap<string, string> = new Map(),
): string | undefined => {
  if (queries.length === 1) {
    const query = queries[0] ?? "";

    return cursorsByQuery.get(query) ?? previousCursorsByQuery.get(query);
  }

  const entries = queries.flatMap((query) => {
    const cursor =
      cursorsByQuery.get(query) ?? previousCursorsByQuery.get(query);

    return cursor === undefined ? [] : [[query, cursor] as const];
  });

  return entries.length === 0
    ? undefined
    : JSON.stringify({ queries: Object.fromEntries(entries) });
};

export const readPositiveInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
};

export const readOptionalPositiveInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return readPositiveInteger(value, minimum, minimum, maximum);
};

export const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

export const readDate = (value: unknown, fallback: Date): Date => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};
