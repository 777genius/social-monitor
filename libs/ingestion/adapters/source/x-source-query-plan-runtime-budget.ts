import type { SourceRuntimeConfig } from "../../ports";
import {
  readArray,
  readOptionalPositiveInteger,
  readRecord,
  readString,
} from "./source-runtime-config-readers";

export type XRuntimeQueryBudget = {
  readonly query: string;
  readonly maxItems: number;
};

export const mergeXRuntimeQueryBudgets = (
  plannedBudgets: readonly XRuntimeQueryBudget[],
  config: SourceRuntimeConfig | undefined,
  maxQueries: number,
): {
  readonly budgets: readonly XRuntimeQueryBudget[];
  readonly capped: boolean;
  readonly maxItems: number;
} => {
  const merged = mergeBudgets(
    [...configuredBudgets(config), ...plannedBudgets],
    maxQueries,
  );

  return {
    ...merged,
    maxItems: compilationMaxItems(merged.budgets, config),
  };
};

const configuredBudgets = (
  config: SourceRuntimeConfig | undefined,
): readonly XRuntimeQueryBudget[] => {
  const queries = readConfiguredQueries(config);
  if (queries.length === 0) {
    return [];
  }

  const explicitBudgets = configuredBudgetByQuery(config);
  const defaultBudget = boundedBudget(
    readOptionalPositiveInteger(
      config?.maxItemsPerQuery ??
        config?.maxItemsPerSearchQuery ??
        config?.maxItemsPerLane,
    ) ??
      Math.ceil(
        (readOptionalPositiveInteger(config?.maxItems) ?? 25) / queries.length,
      ),
  );

  return queries.map((query) => ({
    query,
    maxItems: explicitBudgets.get(normalizedQueryKey(query)) ?? defaultBudget,
  }));
};

const readConfiguredQueries = (
  config: SourceRuntimeConfig | undefined,
): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [config?.searchQueries, config?.queries]) {
    for (const candidate of readArray(value)) {
      const query = readString(candidate);
      if (query === undefined) {
        continue;
      }

      const key = normalizedQueryKey(query);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(query);
      }
    }
  }

  return result;
};

const configuredBudgetByQuery = (
  config: SourceRuntimeConfig | undefined,
): ReadonlyMap<string, number> => {
  const raw = config?.searchQueryBudgets ?? config?.searchQueryMaxItems;
  const entries = Array.isArray(raw)
    ? raw.flatMap((value): readonly [string, number][] => {
        const record = readRecord(value);
        const query = readString(record?.query);
        const maxItems = readOptionalPositiveInteger(
          record?.maxItems ?? record?.maxItemsPerQuery,
        );

        return query === undefined || maxItems === undefined
          ? []
          : [[normalizedQueryKey(query), boundedBudget(maxItems)]];
      })
    : Object.entries(readRecord(raw) ?? {}).flatMap(
        ([query, value]): readonly [string, number][] => {
          const maxItems = readOptionalPositiveInteger(value);

          return maxItems === undefined
            ? []
            : [[normalizedQueryKey(query), boundedBudget(maxItems)]];
        },
      );

  return new Map(entries);
};

const mergeBudgets = (
  budgets: readonly XRuntimeQueryBudget[],
  maxQueries: number,
): {
  readonly budgets: readonly XRuntimeQueryBudget[];
  readonly capped: boolean;
} => {
  const merged = new Map<string, XRuntimeQueryBudget>();
  for (const budget of budgets) {
    const query = budget.query.trim();
    if (query.length === 0) {
      continue;
    }

    const key = normalizedQueryKey(query);
    const current = merged.get(key);
    merged.set(key, {
      query: current?.query ?? query,
      maxItems: Math.max(
        current?.maxItems ?? 0,
        boundedBudget(budget.maxItems),
      ),
    });
  }

  const ordered = [...merged.values()];
  return {
    budgets: ordered.slice(0, maxQueries),
    capped: ordered.length > maxQueries,
  };
};

const compilationMaxItems = (
  budgets: readonly XRuntimeQueryBudget[],
  config: SourceRuntimeConfig | undefined,
): number => {
  const candidateBudget = Math.min(
    100,
    budgets.reduce((total, budget) => total + budget.maxItems, 0),
  );
  const configured = readOptionalPositiveInteger(config?.maxItems);

  return Math.max(
    1,
    configured === undefined
      ? candidateBudget
      : Math.min(candidateBudget, configured, 100),
  );
};

const normalizedQueryKey = (query: string): string =>
  query.trim().replace(/\s+/gu, " ").toLowerCase();

const boundedBudget = (value: number): number =>
  Math.max(1, Math.min(100, value));
