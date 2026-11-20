import {
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
  READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
} from "../../domain";
import { buildGroundedTopicCohortsForCandidates } from "./agent-runtime-reader-summary-topic-grounded-cohorts";
import { recoverEligibleGroundedTopicCohort } from "./agent-runtime-reader-summary-topic-cohort-recovery-policy";
import {
  normalizeIntegrityFixture,
  topicIntegrityFixture,
} from "./agent-runtime-reader-summary-topic-integrity.spec-support";

const groundedRecovery = () => {
  const fixture = topicIntegrityFixture(
    ["Beacon", "Harbor"],
    ["Orion Beacon", "Orion Harbor"],
  );
  const cohort = buildGroundedTopicCohortsForCandidates(fixture.candidates)[0];
  if (cohort === undefined) throw new Error("Expected an identity-grounded cohort");
  const nodeLabels = normalizeIntegrityFixture(fixture).nodeLabels.map((label) => ({
    ...label,
    groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
  }));
  return {
    nodeLabels,
    cohort,
    candidateById: new Map(fixture.candidates.map((candidate) => [candidate.nodeId, candidate] as const)),
    assignedGroupByNodeId: new Map(
      fixture.candidates.map((candidate) => [candidate.nodeId, READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID] as const),
    ),
    activeGroupIds: new Set<string>(),
  };
};

describe("one identity-grounded cohort recovery", () => {
  it("publishes two independently supported members without mutating inputs", () => {
    const params = groundedRecovery();
    const original = params.nodeLabels.map((label) => ({ ...label }));
    const recovery = recoverEligibleGroundedTopicCohort(params);
    expect(recovery).toBeDefined();
    expect(recovery?.recoveredNodeCount).toBe(2);
    expect(recovery?.display).toBe("Orion");
    expect(recovery?.nodeLabels.map((label) => label.groupId)).toEqual([
      params.cohort.groupId, params.cohort.groupId,
    ]);
    expect(recovery?.nodeLabels.map((label) => label.keywords?.[0])).toEqual(["Orion", "Orion"]);
    expect(params.nodeLabels).toEqual(original);
    expect(params.activeGroupIds.size).toBe(0);
  });

  it("rejects a new cohort at capacity before altering any group state", () => {
    const params = groundedRecovery();
    const activeGroupIds = new Set(
      Array.from({ length: READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS },
        (_, index) => `group:existing-${index}`),
    );
    expect(recoverEligibleGroundedTopicCohort({ ...params, activeGroupIds })).toBeUndefined();
    expect(activeGroupIds.size).toBe(READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS);
    expect(params.nodeLabels.every((label) =>
      label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID)).toBe(true);
  });

  it("requires two qualified identities and rejects a conflicting original group", () => {
    const params = groundedRecovery();
    const lowConfidence = params.nodeLabels.map((label, index) => index === 1
      ? { ...label, semantic: label.semantic === undefined ? undefined : {
        ...label.semantic, confidenceScore: 0.2,
      } }
      : label);
    expect(recoverEligibleGroundedTopicCohort({ ...params, nodeLabels: lowConfidence })).toBeUndefined();

    const assignedGroupByNodeId = new Map(params.assignedGroupByNodeId);
    assignedGroupByNodeId.set(params.nodeLabels[1]!.nodeId, "group:other");
    expect(recoverEligibleGroundedTopicCohort({
      ...params, assignedGroupByNodeId,
    })).toBeUndefined();
    expect(params.nodeLabels.every((label) =>
      label.groupId === READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID)).toBe(true);
  });
});
