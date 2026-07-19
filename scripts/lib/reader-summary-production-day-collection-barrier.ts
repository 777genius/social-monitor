export type ProductionDayStepStatus = "passed" | "failed" | "skipped";

export const collectionIsReadyForProductionSummary = (params: {
  readonly liveCollection: boolean;
  readonly collectionStepStatus: ProductionDayStepStatus;
  readonly collectionQualityStepStatus: ProductionDayStepStatus;
}): boolean =>
  params.collectionQualityStepStatus === "passed" &&
  (!params.liveCollection || params.collectionStepStatus === "passed");

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
): readonly {
  readonly id: (typeof blockedStepIds)[number];
  readonly command: string;
  readonly status: "skipped";
  readonly durationMs: 0;
  readonly exitCode: null;
}[] =>
  blockedStepIds.map((id) => ({
    id,
    command: `${id} -- skipped: ${reason}`,
    status: "skipped",
    durationMs: 0,
    exitCode: null,
  }));
