import {
  artifactQualityIsReadyForCleanDayE2e,
  blockedCleanDayE2eStep,
  blockedProductionDaySteps,
  collectionIsReadyForProductionSummary,
  exactProductionDayStepsPassed,
  requiredProductionDayStepIds,
  type ProductionDayStepReport,
} from "./reader-summary-production-day-collection-barrier";

describe("production-day collection barrier", () => {
  it("allows one summary only after live collection and quality pass", () => {
    expect(
      collectionIsReadyForProductionSummary({
        liveCollection: true,
        collectionStepStatus: "passed",
        collectionQualityStepStatus: "passed",
        requiredProvidersReady: true,
      }),
    ).toBe(true);
  });

  it.each([
    ["failed", "passed"],
    ["passed", "failed"],
    ["failed", "failed"],
  ] as const)(
    "blocks summary for collection=%s and quality=%s",
    (collectionStepStatus, collectionQualityStepStatus) => {
      expect(
        collectionIsReadyForProductionSummary({
          liveCollection: true,
          collectionStepStatus,
          collectionQualityStepStatus,
          requiredProvidersReady: true,
        }),
      ).toBe(false);
    },
  );

  it("allows artifact reuse only when database quality passes", () => {
    expect(
      collectionIsReadyForProductionSummary({
        liveCollection: false,
        collectionStepStatus: "skipped",
        collectionQualityStepStatus: "passed",
        requiredProvidersReady: true,
      }),
    ).toBe(true);
    expect(
      collectionIsReadyForProductionSummary({
        liveCollection: false,
        collectionStepStatus: "skipped",
        collectionQualityStepStatus: "failed",
        requiredProvidersReady: true,
      }),
    ).toBe(false);
  });

  it("blocks AI when a required provider is not ready despite passing commands", () => {
    expect(
      collectionIsReadyForProductionSummary({
        liveCollection: true,
        collectionStepStatus: "passed",
        collectionQualityStepStatus: "passed",
        requiredProvidersReady: false,
      }),
    ).toBe(false);
  });

  it("marks every expensive post-collection step skipped for a durable failure report", () => {
    const steps = blockedProductionDaySteps("collection quality failed");

    expect(steps.map((step) => step.id)).toEqual([
      "durable-reader-summary",
      "artifact-quality",
      "quality-dashboard",
      "top-read-ranking",
      "source-quality-trace",
      "clean-day-e2e",
    ]);
    expect(steps.every((step) => step.status === "skipped")).toBe(true);
    expect(
      steps.every((step) => step.command.includes("collection quality failed")),
    ).toBe(true);
  });

  it("does not diagnose a stale clean-day artifact after artifact quality fails", () => {
    expect(artifactQualityIsReadyForCleanDayE2e("failed")).toBe(false);
    expect(artifactQualityIsReadyForCleanDayE2e("skipped")).toBe(false);
    expect(artifactQualityIsReadyForCleanDayE2e("passed")).toBe(true);

    expect(
      blockedCleanDayE2eStep(
        "artifact-quality failed; no current-date artifact was written",
      ),
    ).toEqual({
      id: "clean-day-e2e",
      command:
        "clean-day-e2e -- skipped: artifact-quality failed; no current-date artifact was written",
      status: "skipped",
      durationMs: 0,
      exitCode: null,
    });
  });

  it("passes only the exact nine executed production steps", () => {
    expect(exactProductionDayStepsPassed(passedSteps())).toBe(true);
  });

  it.each(requiredProductionDayStepIds)(
    "fails closed when %s is missing",
    (stepId) => {
      expect(
        exactProductionDayStepsPassed(
          passedSteps().filter((step) => step.id !== stepId),
        ),
      ).toBe(false);
    },
  );

  it.each(requiredProductionDayStepIds)(
    "fails closed when %s is duplicated",
    (stepId) => {
      const steps = passedSteps();
      expect(
        exactProductionDayStepsPassed([
          ...steps,
          steps.find((step) => step.id === stepId) as ProductionDayStepReport,
        ]),
      ).toBe(false);
    },
  );

  it.each(["skipped", "failed"] as const)(
    "fails closed when a required step is %s",
    (status) => {
      expect(
        exactProductionDayStepsPassed(
          passedSteps().map((step) =>
            step.id === "quality-dashboard"
              ? {
                  ...step,
                  status,
                  exitCode: status === "failed" ? 1 : null,
                }
              : step,
          ),
        ),
      ).toBe(false);
    },
  );

  it("rejects a forged passed status with a nonzero exit", () => {
    expect(
      exactProductionDayStepsPassed(
        passedSteps().map((step) =>
          step.id === "collect" ? { ...step, exitCode: 1 } : step,
        ),
      ),
    ).toBe(false);
  });
});

function passedSteps(): readonly ProductionDayStepReport[] {
  return requiredProductionDayStepIds.map((id) => ({
    id,
    command: `npm run test:${id}`,
    status: "passed",
    durationMs: 1,
    exitCode: 0,
  }));
}
