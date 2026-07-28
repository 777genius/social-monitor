export type ProductionDayStepStatus = "passed" | "failed" | "skipped";

export type ProductionDayStepReport = {
  readonly id: string;
  readonly command: string;
  readonly status: ProductionDayStepStatus;
  readonly durationMs: number;
  readonly exitCode: number | null;
};

export const requiredProductionDayStepIds = [
  "migrate",
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
