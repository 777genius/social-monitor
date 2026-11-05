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

export function resolveBoundedHistoricalRecovery(params: {
  readonly requested: boolean;
  readonly executionMode: ProductionDayExecutionRequest["mode"];
  readonly allowHistorical: boolean;
  readonly update: boolean;
  readonly collectionDate: string;
  readonly expectedDate: string | undefined;
  readonly today?: string;
}): boolean {
  if (!params.requested) return false;
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  if (
    params.executionMode !== "live-production" ||
    !params.allowHistorical ||
    !params.update ||
    params.expectedDate !== params.collectionDate ||
    params.collectionDate >= today
  ) {
    throw new Error(
      "Bounded historical recovery requires an update-mode live collection for the exact closed date selected by daily-run",
    );
  }
  return true;
}

export function shouldRunCleanDayE2e(params: {
  readonly reuseExistingArtifacts: boolean;
  readonly executionMode: ProductionDayExecutionRequest["mode"];
  readonly skipLiveCollection: boolean;
  readonly allowHistorical: boolean;
  readonly boundedHistoricalRecovery: boolean;
  readonly collectionDate: string;
  readonly today?: string;
}): boolean {
  if (params.reuseExistingArtifacts ||
      params.executionMode === "historical-regeneration") return true;
  if (params.skipLiveCollection) return false;
  if (!params.allowHistorical || params.boundedHistoricalRecovery) return true;
  return params.collectionDate >=
    (params.today ?? new Date().toISOString().slice(0, 10));
}
