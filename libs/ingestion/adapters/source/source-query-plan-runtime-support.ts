import type { SourceQueryPlan, SourceQueryPlanLane } from "../../domain";
import type { SourceQuery } from "../../ports";
import type { SourceQueryPlannerRuntimeCompilation } from "./source-query-plan-runtime-compiler";
import {
  compactUnique,
  readArray,
  readString,
} from "./source-runtime-config-readers";

export const executableLanes = (
  plan: SourceQueryPlan,
  providerKey: string,
): readonly SourceQueryPlanLane[] =>
  plan.lanes.filter((lane) => lane.sourceKey === providerKey);

export const skippedLaneWarnings = (
  lanes: readonly SourceQueryPlanLane[],
  executableCount: number,
): readonly string[] =>
  executableCount >=
  lanes.filter((lane) => lane.operation !== "enrichment").length
    ? []
    : ["source_query_planner.some_lanes_skipped"];

export const fallbackCompilation = (
  sourceQuery: SourceQuery,
  warning: string,
): SourceQueryPlannerRuntimeCompilation => ({
  sourceQuery,
  warnings: [warning],
  applied: false,
});

export const readStringArrayFromValues = (
  ...values: readonly unknown[]
): readonly string[] =>
  compactUnique(
    values.flatMap(readArray).flatMap((value) => {
      const text = readString(value);

      return text === undefined ? [] : [text];
    }),
  );

export const readStringArrayParameter = (
  lane: SourceQueryPlanLane,
  key: string,
): readonly string[] | undefined => {
  const value = lane.parameters?.[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.flatMap((item) => {
    const text = readString(item);

    return text === undefined ? [] : [text];
  });

  return items.length === 0 ? undefined : compactUnique(items);
};

export const readStringParameter = (
  lane: SourceQueryPlanLane,
  key: string,
): string | undefined => readString(lane.parameters?.[key]);

export const readNumberParameter = (
  lane: SourceQueryPlanLane,
  key: string,
): number | undefined => {
  const value = lane.parameters?.[key];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

export const totalMaxItems = (
  lanes: readonly SourceQueryPlanLane[],
): number =>
  Math.max(
    1,
    Math.min(
      100,
      lanes.reduce((total, lane) => total + maxItemsForLane(lane), 0),
    ),
  );

export const maxItemsForLane = (lane: SourceQueryPlanLane): number =>
  Math.max(1, Math.min(100, lane.maxItems));
