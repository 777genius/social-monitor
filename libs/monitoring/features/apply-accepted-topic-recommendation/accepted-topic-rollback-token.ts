import type { SourceBindingConfig } from "../../ports";

export type SourceBindingConfigRollbackToken = {
  readonly schemaVersion: 1;
  readonly sourceBindingId: string;
  readonly previousConfig: SourceBindingConfig;
  readonly appliedConfig: SourceBindingConfig;
  readonly changedConfigPaths: readonly string[];
};

export const createRollbackToken = (params: {
  readonly sourceBindingId: string;
  readonly previousConfig: SourceBindingConfig;
  readonly appliedConfig: SourceBindingConfig;
  readonly changedConfigPaths: readonly string[];
}): SourceBindingConfigRollbackToken => ({
  schemaVersion: 1,
  sourceBindingId: params.sourceBindingId,
  previousConfig: params.previousConfig,
  appliedConfig: params.appliedConfig,
  changedConfigPaths: params.changedConfigPaths,
});

export const parseRollbackToken = (
  value: Readonly<Record<string, unknown>> | undefined,
): SourceBindingConfigRollbackToken | null => {
  if (value === undefined || value.schemaVersion !== 1) {
    return null;
  }

  if (
    typeof value.sourceBindingId !== "string" ||
    !isSourceBindingConfig(value.previousConfig) ||
    !isSourceBindingConfig(value.appliedConfig) ||
    !Array.isArray(value.changedConfigPaths)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    sourceBindingId: value.sourceBindingId,
    previousConfig: value.previousConfig,
    appliedConfig: value.appliedConfig,
    changedConfigPaths: value.changedConfigPaths.filter(
      (path): path is string => typeof path === "string",
    ),
  };
};

export const sameConfig = (
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean => stableSerialize(left) === stableSerialize(right);

const isSourceBindingConfig = (value: unknown): value is SourceBindingConfig =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};
