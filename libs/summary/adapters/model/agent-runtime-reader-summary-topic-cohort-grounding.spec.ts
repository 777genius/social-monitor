import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { selectGroundedCohortDisplays } from "./agent-runtime-reader-summary-topic-cohort-grounding";
import {
  normalizeIntegrityFixture,
  topicIntegrityFixture,
  ungrouped,
} from "./agent-runtime-reader-summary-topic-integrity.spec-support";

const groundedFixture = (fallbacks: readonly string[] = ["Orion Beacon", "Orion Harbor"]) => {
  const fixture = topicIntegrityFixture(["Beacon", "Harbor"], fallbacks);
  const cohort = buildGroundedTopicCohortsForCandidates(fixture.candidates)[0];
  if (cohort === undefined) throw new Error("Expected a grounded cohort");
  const nodeLabels = normalizeIntegrityFixture(fixture).nodeLabels;
  const candidateById = new Map(fixture.candidates.map((candidate) => [candidate.nodeId, candidate] as const));
  const assignedGroupByNodeId = new Map<string, string>(fixture.candidates.map((candidate) => [candidate.nodeId, ungrouped]));
  return { fixture, cohort, nodeLabels, candidateById, assignedGroupByNodeId };
};

describe("grounded cohort display admission boundary", () => {
  it("admits two supported display tokens in deterministic candidate order", () => {
    const context = groundedFixture();
    const displays = selectGroundedCohortDisplays(context);
    expect([...displays.entries()]).toEqual(context.fixture.candidates.map((candidate) => [candidate.nodeId, "Orion"]));
  });

  it("rejects low-confidence members regardless of model keywords", () => {
    const context = groundedFixture();
    const nodeLabels = context.nodeLabels.map((label, index) => index === 1 ? {
      ...label,
      semantic: label.semantic === undefined ? undefined : { ...label.semantic, confidenceScore: 0.2 },
      keywords: ["Orion"],
    } : label);
    const displays = selectGroundedCohortDisplays({ ...context, nodeLabels });
    expect([...displays.keys()]).toEqual([context.fixture.candidates[0]!.nodeId]);
  });

  it("rejects conflicting current or original group assignments", () => {
    const context = groundedFixture();
    const nodeLabels = context.nodeLabels.map((label, index) =>
      index === 0 ? { ...label, groupId: "group:other" } : label,
    );
    const assignedGroupByNodeId = new Map(context.assignedGroupByNodeId);
    assignedGroupByNodeId.set(context.fixture.candidates[1]!.nodeId, "group:other");
    expect(selectGroundedCohortDisplays({ ...context, nodeLabels, assignedGroupByNodeId }).size).toBe(0);
  });

  it("preserves original display spelling from punctuated identity evidence", () => {
    const context = groundedFixture(["Orion/Beacon", "Orion/Harbor"]);
    expect([...selectGroundedCohortDisplays(context).values()]).toEqual(["Orion", "Orion"]);
  });
});
