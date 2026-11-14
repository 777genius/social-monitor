import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
} from "../../domain";
import {
  collectExistingGroundedCohortIds,
  hasGroundedCohortCapacity,
  hasGroundedCohortMinimum,
} from "./agent-runtime-reader-summary-topic-cohort-admission";
import {
  normalizeIntegrityFixture,
  topicIntegrityFixture,
} from "./agent-runtime-reader-summary-topic-integrity.spec-support";

describe("grounded topic cohort recovery admission", () => {
  it("counts only distinct admitted groups, excluding the reserved ungrouped bucket", () => {
    const plan = normalizeIntegrityFixture(
      topicIntegrityFixture(["Beacon", "Harbor", "Cobalt", "Juniper"]),
    );
    const labels = plan.nodeLabels.map((label, index) => ({
      ...label,
      groupId: index === 0
        ? READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
        : index === 1 ? "group:beacon" : "group:harbor",
    }));

    expect([...collectExistingGroundedCohortIds(labels)]).toEqual([
      "group:beacon", "group:harbor",
    ]);
    expect(collectExistingGroundedCohortIds(
      labels.map((label) => ({
        ...label, groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      })),
    ).size).toBe(0);
  });

  it("admits a new cohort below the cap but allows only existing cohorts at the cap", () => {
    const ids = new Set(
      Array.from({ length: READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS },
        (_, index) => `group:existing-${index}`),
    );
    const firstExisting = "group:existing-0";
    expect(hasGroundedCohortCapacity("group:new", new Set([...ids].slice(1)))).toBe(true);
    expect(hasGroundedCohortCapacity("group:new", ids)).toBe(false);
    expect(hasGroundedCohortCapacity(firstExisting, ids)).toBe(true);
  });

  it("never admits an empty or singleton grounded display, but counts existing eligible members", () => {
    expect(hasGroundedCohortMinimum(new Map())).toBe(false);
    expect(hasGroundedCohortMinimum(new Map([["node:one", "Orion"]]))).toBe(false);
    expect(hasGroundedCohortMinimum(new Map([
      ["node:existing", "Orion"], ["node:recovered", "Orion"],
    ]))).toBe(true);
  });
});
