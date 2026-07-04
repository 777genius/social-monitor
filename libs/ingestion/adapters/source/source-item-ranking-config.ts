import {
  createSourceItemRankingPlan,
  type SourceItemRankingPlan,
} from "../../domain";
import type { SourceRuntimeConfig } from "../../ports";

export const readSourceItemRankingPlan = (
  config: SourceRuntimeConfig | undefined,
  fallbackQueries: readonly string[],
): SourceItemRankingPlan => {
  const record = readRecord(config);
  const configuredQueries = [
    ...readStringArray(record?.rankingQueries),
    ...readStringArray(record?.sourceRankingQueries),
    ...readOptionalStringArray(record?.rankingQuery),
    ...readOptionalStringArray(record?.sourceRankingQuery),
  ];

  return createSourceItemRankingPlan({
    mode: readRankingModeConfigValue(
      record?.sourceRankingMode,
      record?.rankingMode,
    ),
    queries: [...configuredQueries, ...fallbackQueries],
  });
};

const readRankingModeConfigValue = (
  ...values: readonly unknown[]
): unknown | undefined => {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      continue;
    }

    return value;
  }

  return undefined;
};

const readOptionalStringArray = (value: unknown): readonly string[] => {
  const item = readOptionalString(value);

  return item === undefined ? [] : [item];
};

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" && item.trim().length > 0
          ? [item.trim()]
          : [],
      )
    : [];

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
