import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../../domain";
import { applyGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-assignment";
import {
  normalizeIntegrityFixture,
  topicIntegrityFixture,
} from "./agent-runtime-reader-summary-topic-integrity.spec-support";

describe("applyGroundedCohortDisplays", () => {
  it("projects only previously accepted identities, retaining stable keyword order and cap", () => {
    const plan = normalizeIntegrityFixture(
      topicIntegrityFixture(["Beacon", "Harbor", "Cobalt"]),
    );
    const before = plan.nodeLabels.map((label, index) => ({
      ...label,
      groupId: index === 2 ? "group:other" : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      keywords: ["ORION", "Beacon", "Copper", "Silver", "Gold", "Zinc", "Iron", "Oak", "Extra"],
    }));
    const result = applyGroundedCohortDisplays(
      before,
      { groupId: "group:orion", sharedAnchor: "orion" },
      new Map(before.slice(0, 2).map((label) => [label.nodeId, "Orion"])),
    );

    expect(result.recoveredNodeCount).toBe(2);
    expect(result.nodeLabels.map((label) => label.groupId)).toEqual([
      "group:orion",
      "group:orion",
      "group:other",
    ]);
    expect(result.nodeLabels[0]?.keywords).toEqual([
      "Orion", "Beacon", "Copper", "Silver", "Gold", "Zinc", "Iron", "Oak",
    ]);
    expect(result.nodeLabels[2]).toBe(before[2]);
    expect(before[0]?.keywords?.[0]).toBe("ORION");
  });

  it("counts newly recovered nodes only, not already accepted members", () => {
    const plan = normalizeIntegrityFixture(
      topicIntegrityFixture(["Beacon", "Harbor"]),
    );
    const before = plan.nodeLabels.map((label, index) => ({
      ...label,
      groupId: index === 0
        ? "group:orion"
        : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
      keywords: ["Orion", "Beacon"],
    }));
    const result = applyGroundedCohortDisplays(
      before,
      { groupId: "group:orion", sharedAnchor: "orion" },
      new Map(before.map((label) => [label.nodeId, "Orion"])),
    );

    expect(result.recoveredNodeCount).toBe(1);
    expect(result.nodeLabels.map((label) => label.groupId)).toEqual([
      "group:orion",
      "group:orion",
    ]);
    expect(result.nodeLabels[0]?.keywords).toEqual(["Orion", "Beacon"]);
  });
});
