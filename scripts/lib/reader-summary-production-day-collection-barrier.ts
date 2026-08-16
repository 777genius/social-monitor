export type ProductionDayStepStatus = "passed" | "failed" | "skipped";

export type ProductionDayStepReport = {
  readonly id: string;
  readonly command: string;
  readonly status: ProductionDayStepStatus;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly admission?: "durable_database_fallback";
  readonly underlyingExitCode?: number | null;
};

export const admitCollectionStepWithDurableDatabaseFallback = (params: {
  readonly step: ProductionDayStepReport;
  readonly fallbackReady: boolean;
}): ProductionDayStepReport => {
  if (
    !params.fallbackReady ||
    params.step.id !== "collect" ||
    params.step.status !== "failed"
  ) {
    return params.step;
  }
  return {
    ...params.step,
    command: `${params.step.command} -- admitted by durable database quality fallback`,
    status: "passed",
    exitCode: 0,
    admission: "durable_database_fallback",
    underlyingExitCode: params.step.exitCode,
  };
};

export const requiredProductionDayStepIds = [
  "collect",
  "collection-quality",
  "durable-reader-summary",
  "artifact-quality",
  "quality-dashboard",
  "top-read-ranking",
  "source-quality-trace",
  "clean-day-e2e",
] as const;

export const collectionIsReadyForProductionSummary = (params: {
  readonly liveCollection: boolean;
  readonly collectionStepStatus: ProductionDayStepStatus;
  readonly collectionQualityStepStatus: ProductionDayStepStatus;
  readonly requiredProvidersReady: boolean;
}): boolean =>
  params.requiredProvidersReady &&
  params.collectionQualityStepStatus === "passed" &&
  (!params.liveCollection || params.collectionStepStatus === "passed");

export const exactProductionDayStepsPassed = (
  steps: readonly ProductionDayStepReport[],
): boolean => {
  if (steps.length !== requiredProductionDayStepIds.length) {
    return false;
  }

  return requiredProductionDayStepIds.every((requiredId) => {
    const matches = steps.filter((step) => step.id === requiredId);
    return (
      matches.length === 1 &&
      matches[0]?.status === "passed" &&
      matches[0].exitCode === 0
    );
  });
};

export const artifactQualityIsReadyForCleanDayE2e = (
  status: ProductionDayStepStatus,
): boolean => status === "passed";

export const blockedCleanDayE2eStep = (
  reason: string,
): ProductionDayStepReport => ({
  id: "clean-day-e2e",
  command: `clean-day-e2e -- skipped: ${reason}`,
  status: "skipped",
  durationMs: 0,
  exitCode: null,
});

const blockedStepIds = [
  "durable-reader-summary",
  "artifact-quality",
  "quality-dashboard",
  "top-read-ranking",
  "source-quality-trace",
  "clean-day-e2e",
] as const;

export const blockedProductionDaySteps = (
  reason: string,
): readonly ProductionDayStepReport[] =>
  blockedStepIds.map((id) => ({
    id,
    command: `${id} -- skipped: ${reason}`,
    status: "skipped",
    durationMs: 0,
    exitCode: null,
  }));
