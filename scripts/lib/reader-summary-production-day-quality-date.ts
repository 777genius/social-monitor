import type { ProductionDayExecutionRequest } from "./reader-summary-production-day-reuse-provenance";

export function productionDayQualityDateArgs(params: {
  readonly executionMode: ProductionDayExecutionRequest["mode"];
  readonly allowHistorical: boolean;
}): readonly string[] {
  return params.allowHistorical ||
    params.executionMode === "historical-regeneration"
    ? ["--allow-historical"]
    : [];
}
