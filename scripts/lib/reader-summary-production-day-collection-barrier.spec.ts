import {
  blockedProductionDaySteps,
  collectionIsReadyForProductionSummary,
} from "./reader-summary-production-day-collection-barrier";

describe("production-day collection barrier", () => {
  it("allows one summary only after live collection and quality pass", () => {
    expect(
      collectionIsReadyForProductionSummary({
        liveCollection: true,
        collectionStepStatus: "passed",
        collectionQualityStepStatus: "passed",
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
      }),
    ).toBe(true);
    expect(
      collectionIsReadyForProductionSummary({
        liveCollection: false,
        collectionStepStatus: "skipped",
        collectionQualityStepStatus: "failed",
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
});
